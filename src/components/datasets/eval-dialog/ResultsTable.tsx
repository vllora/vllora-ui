/**
 * ResultsTable
 *
 * Evaluation results table with expandable rows for reason/criteria.
 * Columns: # | Input | Topic | Score | Reason/Status | Logs
 * Uses @tanstack/react-virtual for efficient rendering of large result sets.
 */

import { useRef, useState, useMemo, useEffect, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlatEvaluationResult } from "@/services/finetune-api";
import { DryrunEvaluationResultRow } from "./DryrunEvaluationResultRow";

type SortOption = "index" | "score-asc" | "score-desc" | "status";

const ROW_HEIGHT = 38;
const EXPANDED_ROW_HEIGHT = 38 + 100; // estimate, measured dynamically

interface ResultsTableProps {
  readonly results: FlatEvaluationResult[];
  /** Total rows in the evaluation (for "showing X of Y" header) */
  readonly totalRows?: number;
  /** Whether to fill available height (use flex-1) */
  readonly fillHeight?: boolean;
  /** Maximum height when not filling (px) */
  readonly maxHeight?: number;
  /** Callback when a row is clicked (external navigation) */
  readonly onRowClick?: (result: FlatEvaluationResult) => void;
  /** ID of the currently expanded row (for external expand/collapse, e.g., PerRowDetailsSection) */
  readonly expandedRowId?: string | null;
  /** Render function for expanded row content (external expand content) */
  readonly renderExpandedContent?: (result: FlatEvaluationResult) => React.ReactNode;
  /** Navigate to a record in the records table */
  readonly onNavigateToRecord?: (recordId: string, result: FlatEvaluationResult) => void;
  /** Job ID for CSV export filename */
  readonly jobId?: string;
  /** Hide the expand chevron column (when using drawer instead of inline expand) */
  readonly hideChevron?: boolean;
}

/** Escape a CSV field value — replace newlines with spaces, quote if needed */
function escapeCsvField(value: string): string {
  const cleaned = value.replace(/[\r\n]+/g, " ").trim();
  if (cleaned.includes(",") || cleaned.includes('"')) {
    return `"${cleaned.replace(/"/g, '""')}"`;
  }
  return cleaned;
}

/** Generate and download a CSV file from evaluation results */
function exportResultsToCsv(
  results: readonly FlatEvaluationResult[],
  jobId?: string,
): void {
  const hasRollout = results.some((r) => r.rollout_content != null && r.rollout_content !== "");
  const header = ["#", "Input", ...(hasRollout ? ["Response"] : []), "Score", "Status", "Reason"];
  const rows = results.map((r) => {
    const inputMessages = r.row?.messages as unknown[] | undefined;
    const inputText = Array.isArray(inputMessages)
      ? inputMessages
          .filter((m) => (m as Record<string, unknown>).role === "user")
          .map((m) => String((m as Record<string, unknown>).content ?? ""))
          .join(" | ")
      : "";
    return [
      String(r.row_index),
      escapeCsvField(inputText),
      ...(hasRollout ? [escapeCsvField(r.rollout_content ?? "")] : []),
      r.score != null ? r.score.toFixed(3) : "",
      r.status,
      escapeCsvField(r.reason ?? r.error_message ?? ""),
    ].join(",");
  });

  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const filename = jobId ? `eval-results-${jobId}.csv` : "eval-results.csv";

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ResultsTable({
  results,
  totalRows,
  fillHeight = false,
  maxHeight = 400,
  onRowClick,
  expandedRowId: externalExpandedRowId,
  renderExpandedContent,
  onNavigateToRecord,
  jobId,
  hideChevron = false,
}: ResultsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [sortOption, setSortOption] = useState<SortOption>("index");
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  // Internal expand state (for built-in reason expand)
  const [internalExpandedId, setInternalExpandedId] = useState<string | null>(null);

  // Use external expand if provided, otherwise internal
  const hasExternalExpand = renderExpandedContent !== undefined;
  const expandedRowId = hasExternalExpand ? externalExpandedRowId : internalExpandedId;

  const processedResults = useMemo(() => {
    const sorted = [...results];
    switch (sortOption) {
      case "index":
        sorted.sort((a, b) => a.row_index - b.row_index);
        break;
      case "score-asc":
        sorted.sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
        break;
      case "score-desc":
        sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
        break;
      case "status":
        sorted.sort((a, b) => {
          const order = { failed: 0, pending: 1, running: 2, completed: 3 };
          return (
            (order[a.status as keyof typeof order] ?? 1) -
            (order[b.status as keyof typeof order] ?? 1)
          );
        });
        break;
    }
    return sorted;
  }, [results, sortOption]);

  const virtualizer = useVirtualizer({
    count: processedResults.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      if (expandedRowId && processedResults[index]?.dataset_row_id === expandedRowId) {
        return EXPANDED_ROW_HEIGHT;
      }
      return ROW_HEIGHT;
    },
    overscan: 5,
  });

  // Remeasure when expanded row changes
  useEffect(() => {
    virtualizer.measure();
  }, [expandedRowId, virtualizer]);

  // Listen for highlight events
  useEffect(() => {
    const handleHighlight = (e: Event) => {
      const recordId = (e as CustomEvent).detail?.recordId;
      if (!recordId) return;
      const index = processedResults.findIndex(
        (r) => r.dataset_row_id === recordId,
      );
      if (index >= 0) {
        virtualizer.scrollToIndex(index, { align: "center" });
        setHighlightedRowId(recordId);
        setTimeout(() => setHighlightedRowId(null), 2000);
      }
    };
    window.addEventListener("vllora_highlight_eval_result", handleHighlight);
    return () => {
      window.removeEventListener("vllora_highlight_eval_result", handleHighlight);
    };
  }, [processedResults, virtualizer]);

  // Show epoch column only when there are multiple distinct epochs
  const hasEpochData = useMemo(() => {
    const epochs = new Set(results.map((r) => r.epoch).filter((e) => e != null));
    return epochs.size > 1;
  }, [results]);
  const hasTrendData = results.some((r) => r.trend != null);

  // Check if all rows have the same status (to replace Status column with Reason)
  const allSameStatus = useMemo(() => {
    if (results.length === 0) return false;
    const firstStatus = results[0].status;
    return results.every((r) => r.status === firstStatus);
  }, [results]);

  // Check if any row has topic data
  const hasTopicData = useMemo(() => {
    return results.some((r) => {
      const row = r.row as Record<string, unknown> | undefined;
      return row && (row.topic || row.topic_name || row.topicName);
    });
  }, [results]);



  const handleRowClick = useCallback((result: FlatEvaluationResult) => {
    if (onRowClick) {
      // External handler (e.g., open drawer)
      onRowClick(result);
    } else {
      // Internal expand/collapse
      setInternalExpandedId((prev) =>
        prev === result.dataset_row_id ? null : result.dataset_row_id,
      );
    }
  }, [onRowClick]);

  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No results available
      </div>
    );
  }

  const showingCount = results.length;
  const total = totalRows ?? results.length;
  const headerLabel =
    showingCount < total
      ? `Results (showing ${showingCount} of ${total})`
      : `Results (${showingCount})`;

  return (
    <div className={cn("flex flex-col", fillHeight && "h-full")}>
      {/* Section header with sort */}
      <div className="flex items-center justify-between shrink-0 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {headerLabel}
        </span>
        <div className="flex items-center gap-1">
          {(["index", "score-desc", "score-asc", "status"] as const).map((opt) => {
            const labels: Record<SortOption, string> = {
              index: "#",
              "score-desc": "Score \u2193",
              "score-asc": "Score \u2191",
              status: "Status",
            };
            return (
              <button
                key={opt}
                onClick={() => setSortOption(opt)}
                className={cn(
                  "px-1.5 py-0.5 text-[10px] rounded transition-colors",
                  sortOption === opt
                    ? "bg-zinc-700/60 text-zinc-200"
                    : "text-zinc-600 hover:text-zinc-400",
                )}
              >
                {labels[opt]}
              </button>
            );
          })}
          <button
            onClick={() => exportResultsToCsv(processedResults, jobId)}
            className="px-1.5 py-0.5 text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Export results to CSV"
          >
            <Download className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Table header */}
      <div className="flex items-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-700/50 shrink-0">
        {!hideChevron && <div className="w-5 shrink-0" />} {/* expand chevron space */}
        <div className="w-8 shrink-0 py-2">#</div>
        {hasEpochData && <div className="w-[50px] shrink-0 text-center py-2">Eval</div>}
        <div className="flex-1 min-w-0 py-2">Input</div>
        {hasTopicData && <div className="w-[120px] shrink-0 py-2">Topic</div>}
        <div className="w-16 shrink-0 text-right pr-4 py-2">Score</div>
        {hasTrendData && <div className="w-[60px] shrink-0 text-center py-2" title="Score change (Δ) between consecutive evaluation checkpoints">Δ</div>}
        {!hasExternalExpand && (
          <div className={cn("w-[140px] shrink-0 pr-2 py-2", allSameStatus ? "pl-2" : "text-center")}>
            {allSameStatus ? "Reason" : "Status"}
          </div>
        )}
        <div className="w-10 shrink-0 text-center py-2">Logs</div>
        {onNavigateToRecord && <div className="w-7 shrink-0" />}
      </div>

      {/* Virtualized rows */}
      <div
        ref={parentRef}
        className={cn("overflow-y-auto", fillHeight && "flex-1 min-h-0")}
        style={fillHeight ? undefined : { maxHeight }}
      >
        {processedResults.length > 0 ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const result = processedResults[virtualRow.index];
              const isExpanded = expandedRowId === result.dataset_row_id;
              return (
                <div
                  key={result.dataset_row_id || `row-${virtualRow.index}`}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <DryrunEvaluationResultRow
                    result={result}
                    index={result.row_index}
                    isHighlighted={highlightedRowId === result.dataset_row_id}
                    onClick={() => handleRowClick(result)}
                    onNavigateToRecord={onNavigateToRecord}
                    showEpoch={hasEpochData}
                    isExpanded={isExpanded}
                    allSameStatus={allSameStatus}
                    showTrend={hasTrendData}
                    showRolloutContent={false}
                    hideStatusColumn={hasExternalExpand}
                    hideChevron={hideChevron}
                  />
                  {/* External expand content (e.g., from PerRowDetailsSection) */}
                  {isExpanded && hasExternalExpand && renderExpandedContent && (
                    <div className="border-t border-zinc-800/40 bg-zinc-900/30 px-6 py-2">
                      {renderExpandedContent(result)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-zinc-500 text-xs">
            No results match your filters
          </div>
        )}
      </div>
    </div>
  );
}
