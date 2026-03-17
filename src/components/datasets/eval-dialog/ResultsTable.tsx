/**
 * ResultsTable
 *
 * Clean evaluation results table matching the mockup design.
 * Columns: # | Input | Score | Status | Logs
 * Uses @tanstack/react-virtual for efficient rendering of large result sets.
 */

import { useRef, useState, useMemo, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import type { FlatEvaluationResult } from "@/services/finetune-api";
import { DryrunEvaluationResultRow } from "./DryrunEvaluationResultRow";

type SortOption = "index" | "score-asc" | "score-desc" | "status";

const ROW_HEIGHT = 38;

interface ResultsTableProps {
  readonly results: FlatEvaluationResult[];
  /** Total rows in the evaluation (for "showing X of Y" header) */
  readonly totalRows?: number;
  /** Whether to fill available height (use flex-1) */
  readonly fillHeight?: boolean;
  /** Maximum height when not filling (px) */
  readonly maxHeight?: number;
  /** Callback when a row is clicked */
  readonly onRowClick?: (result: FlatEvaluationResult) => void;
  /** ID of the currently expanded row (for expand/collapse support) */
  readonly expandedRowId?: string | null;
  /** Render function for expanded row content */
  readonly renderExpandedContent?: (result: FlatEvaluationResult) => React.ReactNode;
}

export function ResultsTable({
  results,
  totalRows,
  fillHeight = false,
  maxHeight = 400,
  onRowClick,
  expandedRowId,
  renderExpandedContent,
}: ResultsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [sortOption, setSortOption] = useState<SortOption>("index");
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);

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

  const isExpandable = !!expandedRowId !== undefined && !!renderExpandedContent;

  const virtualizer = useVirtualizer({
    count: processedResults.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      if (expandedRowId && processedResults[index]?.dataset_row_id === expandedRowId) {
        return ROW_HEIGHT + 150;
      }
      return ROW_HEIGHT;
    },
    overscan: 5,
  });

  // Remeasure when expanded row changes
  useEffect(() => {
    if (isExpandable) virtualizer.measure();
  }, [expandedRowId, virtualizer, isExpandable]);

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
              "score-desc": "Score ↓",
              "score-asc": "Score ↑",
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
        </div>
      </div>

      {/* Table header */}
      <div className="flex items-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-700/50 shrink-0">
        <div className="w-10 shrink-0 px-3 py-2">#</div>
        <div className="flex-1 min-w-0 py-2">Input</div>
        <div className="w-16 shrink-0 text-right pr-4 py-2">Score</div>
        <div className="w-16 shrink-0 text-right pr-4 py-2">Status</div>
        <div className="w-10 shrink-0 text-center py-2">Logs</div>
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
              return (
                <div
                  key={result.dataset_row_id || `row-${virtualRow.index}`}
                  ref={isExpandable ? virtualizer.measureElement : undefined}
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
                    onClick={onRowClick ? () => onRowClick(result) : undefined}
                  />
                  {expandedRowId === result.dataset_row_id && renderExpandedContent && (
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
