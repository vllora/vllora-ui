/**
 * PerRowDetailsSection
 *
 * Displays per-row evaluation details for finetune training.
 * Uses the shared ResultsTable with expand support — clicking a row
 * reveals the EpochScoresTable showing score progression across epochs.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FinetuneEvalResultsResponse, FlatEvaluationResult } from "@/services/finetune-api";
import {
  parseScoreBreakdown,
  getAllCriteriaNames,
} from "@/utils/parse-score-breakdown";
import { getScoreColorClass, formatScore } from "@/utils/parse-score-breakdown";
import { ResultsTable } from "@/components/datasets/eval-dialog/ResultsTable";
import { EpochScoresTable, type EpochScore } from "./EpochScoresTable";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { emitter } from "@/utils/eventEmitter";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";


interface PerRowDetailsSectionProps {
  results: FinetuneEvalResultsResponse["results"];
  /** Dataset ID for navigation (click record ID → switch to Records tab) */
  workflowId?: string;
}

interface RowEpochData {
  epochs: EpochScore[];
  criteriaNames: string[];
}

/** Compute score trend between latest and previous eval checkpoint.
 *  Uses mean of all candidate scores per checkpoint (consistent with how training algorithms use rewards).
 *  Returns trend, prevScore (mean), currentScore (mean), and candidate counts for tooltip. */
function computeEpochTrend(
  epochs: Record<number, { score?: number }[]>,
  sortedEpochNumbers: readonly number[],
): { trend: number; prevScore: number; currentScore: number; prevCount: number; currentCount: number; prevScores: number[]; currentScores: number[] } | undefined {
  if (sortedEpochNumbers.length < 2) return undefined;

  const latestEpoch = sortedEpochNumbers[sortedEpochNumbers.length - 1];
  const prevEpoch = sortedEpochNumbers[sortedEpochNumbers.length - 2];

  const latestScores = (epochs[latestEpoch] ?? []).map(e => e.score).filter((s): s is number => s != null);
  const prevScores = (epochs[prevEpoch] ?? []).map(e => e.score).filter((s): s is number => s != null);

  if (latestScores.length === 0 || prevScores.length === 0) return undefined;

  const latestMean = latestScores.reduce((a, b) => a + b, 0) / latestScores.length;
  const prevMean = prevScores.reduce((a, b) => a + b, 0) / prevScores.length;

  return {
    trend: latestMean - prevMean,
    prevScore: prevMean,
    currentScore: latestMean,
    prevCount: prevScores.length,
    currentCount: latestScores.length,
    prevScores,
    currentScores: latestScores,
  };
}

export function PerRowDetailsSection({ results, workflowId }: PerRowDetailsSectionProps) {
  const { sortedRecords } = DatasetDetailConsumer();
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Auto-expand row when navigating from QualityIndicator finetune score click
  useEffect(() => {
    const handleHighlight = (e: Event) => {
      const recordId = (e as CustomEvent).detail?.recordId;
      if (recordId) setExpandedRowId(recordId);
    };
    window.addEventListener('vllora_highlight_eval_result', handleHighlight);
    return () => window.removeEventListener('vllora_highlight_eval_result', handleHighlight);
  }, []);

  // Flatten latest epoch per row for the table, keep all epochs for expand
  const { flatResults, epochDataMap } = useMemo(() => {
    const flat: FlatEvaluationResult[] = [];
    const epochMap = new Map<string, RowEpochData>();

    for (const row of results) {
      if (!row.epochs) continue;
      const epochNumbers = Object.keys(row.epochs).map(Number).sort((a, b) => a - b);
      if (epochNumbers.length === 0) continue;

      // Collect all epoch data for the expand content
      const rowEpochs: EpochScore[] = [];
      for (const epochNum of epochNumbers) {
        const evalResults = row.epochs[epochNum];
        for (const result of evalResults) {
          if (typeof result.score === "number") {
            const breakdown = parseScoreBreakdown(result.reason);
            rowEpochs.push({
              epoch: epochNum,
              score: result.score,
              breakdown,
              logs: result.logs,
              rolloutContent: result.rollout_content as string | null | undefined,
            });
          }
        }
      }

      // Latest epoch for the flat table row — use best score among candidates
      const latestEpoch = epochNumbers[epochNumbers.length - 1];
      const latestResults = row.epochs[latestEpoch];
      const latestResult = latestResults && latestResults.length > 1
        ? [...latestResults].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
        : latestResults?.[0];

      const rowId = row.row?.id ?? `finetune-row-${row.row_index}`;

      // Compute trend: score diff between latest and previous epoch (best candidates)
      const trendData = computeEpochTrend(row.epochs, epochNumbers);

      const candidateScores = (latestResults ?? [])
        .map((r) => r.score)
        .filter((s): s is number => s != null);

      flat.push({
        dataset_row_id: rowId,
        row_index: row.row_index,
        row: row.row ?? undefined,
        status: latestResult?.status ?? "completed",
        score: trendData?.currentScore ?? latestResult?.score ?? undefined,
        reason: latestResult?.reason ?? undefined,
        logs: latestResult?.logs ?? undefined,
        epoch: latestEpoch,
        trend: trendData?.trend,
        trendPrevScores: trendData?.prevScores,
        trendCurrentScores: trendData?.currentScores,
        candidateScores: candidateScores.length > 1 ? candidateScores : undefined,
      });

      const criteriaNames = getAllCriteriaNames(rowEpochs.map(e => e.breakdown));
      epochMap.set(rowId, { epochs: rowEpochs, criteriaNames });
    }

    return { flatResults: flat, epochDataMap: epochMap };
  }, [results]);

  // Filter presets
  type FilterPreset = "all" | "failing" | "improved" | "regressed" | "perfect";
  const [activeFilter, setActiveFilter] = useState<FilterPreset>("all");

  const filteredResults = useMemo(() => {
    switch (activeFilter) {
      case "failing": return flatResults.filter((r) => r.score != null && r.score < 0.5);
      case "improved": return flatResults.filter((r) => r.trend != null && r.trend > 0);
      case "regressed": return flatResults.filter((r) => r.trend != null && r.trend < 0);
      case "perfect": return flatResults.filter((r) => r.score != null && r.score >= 1.0);
      default: return flatResults;
    }
  }, [flatResults, activeFilter]);

  // Row click → open side panel (toggle off if same row)
  const handleRowClick = useCallback((result: FlatEvaluationResult) => {
    setExpandedRowId((prev) => prev === result.dataset_row_id ? null : result.dataset_row_id);
  }, []);

  // Navigate prev/next in filtered list
  const selectedResult = filteredResults.find((r) => r.dataset_row_id === expandedRowId);
  const selectedIndex = selectedResult ? filteredResults.indexOf(selectedResult) : -1;
  const handlePrev = useCallback(() => {
    if (selectedIndex > 0) setExpandedRowId(filteredResults[selectedIndex - 1].dataset_row_id);
  }, [selectedIndex, filteredResults]);
  const handleNext = useCallback(() => {
    if (selectedIndex < filteredResults.length - 1) setExpandedRowId(filteredResults[selectedIndex + 1].dataset_row_id);
  }, [selectedIndex, filteredResults]);

  // Keyboard nav
  useEffect(() => {
    if (!expandedRowId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") { e.preventDefault(); handlePrev(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); handleNext(); }
      else if (e.key === "Escape") setExpandedRowId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [expandedRowId, handlePrev, handleNext]);

  const filterCounts = useMemo(() => ({
    all: flatResults.length,
    failing: flatResults.filter((r) => r.score != null && r.score < 0.5).length,
    improved: flatResults.filter((r) => r.trend != null && r.trend > 0).length,
    regressed: flatResults.filter((r) => r.trend != null && r.trend < 0).length,
    perfect: flatResults.filter((r) => r.score != null && r.score >= 1.0).length,
  }), [flatResults]);

  if (flatResults.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-2">
        No row data available
      </div>
    );
  }

  const handleNavigateToRecord = useCallback((_cloudRowId: string, result: FlatEvaluationResult) => {
    const gatewayId = (result?.row?.id ?? _cloudRowId) as string;
    const record = sortedRecords.find((r) => r.id === gatewayId);
    if (record?.topic && workflowId) {
      window.dispatchEvent(new CustomEvent("vllora_navigate_to_job", {
        detail: { jobId: record.topic, type: "topic" },
      }));
    } else if (workflowId) {
      emitter.emit("vllora_navigate_to_record", { workflowId, recordId: gatewayId });
    }
  }, [sortedRecords, workflowId]);

  // Extract text from row data for the side panel
  const getInputText = (row?: Record<string, unknown>): string => {
    if (!row?.messages || !Array.isArray(row.messages)) return "—";
    const userMsg = row.messages.find((m: unknown) => (m as Record<string, unknown>)?.role === "user") as Record<string, unknown> | undefined;
    return (userMsg?.content as string)?.trim() ?? "—";
  };
  const getOutputText = (row?: Record<string, unknown>): string | null => {
    if (!row?.messages || !Array.isArray(row.messages)) return null;
    const msgs = row.messages.filter((m: unknown) => (m as Record<string, unknown>)?.role === "assistant") as Record<string, unknown>[];
    return (msgs[msgs.length - 1]?.content as string)?.trim() ?? null;
  };

  const FILTER_BUTTONS: { key: FilterPreset; label: string; color?: string; tooltip: string }[] = [
    { key: "all", label: "All", tooltip: "Show all records" },
    { key: "failing", label: "Score < 0.5", color: "text-red-400", tooltip: "Records scoring below 0.5" },
    { key: "improved", label: "Score ↑", color: "text-emerald-400", tooltip: "Records that scored higher than the previous evaluation" },
    { key: "regressed", label: "Score ↓", color: "text-amber-400", tooltip: "Records that scored lower than the previous evaluation" },
    { key: "perfect", label: "Score = 1.0", color: "text-emerald-300", tooltip: "Records with a perfect score" },
  ];

  // Side panel data
  const panelEpochData = expandedRowId ? epochDataMap.get(expandedRowId) : null;

  return (
    <div className="relative">
      {/* Table (always full width) */}
      <div>
        {/* Filter presets */}
        <div className="flex items-center gap-1 mb-2">
          {FILTER_BUTTONS.map(({ key, label, color, tooltip }) => {
            const count = filterCounts[key];
            if (key !== "all" && count === 0) return null;
            return (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                title={tooltip}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  activeFilter === key
                    ? "bg-zinc-700/80 text-zinc-200"
                    : `text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 ${color ?? ""}`
                }`}
              >
                {label} <span className="text-zinc-600 ml-0.5">{count}</span>
              </button>
            );
          })}
        </div>

        <ResultsTable
          results={filteredResults}
          onRowClick={handleRowClick}
          onNavigateToRecord={handleNavigateToRecord}
          maxHeight={500}
          hideChevron
        />
      </div>

      {/* Record inspection drawer */}
      <Sheet open={!!expandedRowId} onOpenChange={(open) => { if (!open) setExpandedRowId(null); }}>
        <SheetContent side="right" className="w-[90vw] sm:w-[60vw] sm:max-w-[900px] bg-[#0a0a0a] border-zinc-800 p-0 flex flex-col">
          {selectedResult && (
            <>
              {/* Header */}
              <SheetHeader className="shrink-0 border-b border-zinc-800/60 px-5 py-3 space-y-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <SheetTitle className="text-[12px] font-medium text-zinc-400">
                      Row {selectedResult.row_index}
                    </SheetTitle>
                    {selectedResult.score != null && (
                      <span className={cn("font-mono text-lg font-bold", getScoreColorClass(selectedResult.score))}>
                        {formatScore(selectedResult.score)}
                      </span>
                    )}
                    {selectedResult.trend != null && selectedResult.trend !== 0 && (
                      <span className={cn(
                        "text-[11px] font-mono px-1.5 py-0.5 rounded",
                        selectedResult.trend > 0 ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10",
                      )}>
                        {selectedResult.trend > 0 ? "+" : ""}{selectedResult.trend.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button onClick={handlePrev} disabled={selectedIndex <= 0} className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 disabled:opacity-20 rounded transition-colors" title="Previous (↑)">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[10px] text-zinc-600 min-w-[40px] text-center">{selectedIndex + 1}/{filteredResults.length}</span>
                    <button onClick={handleNext} disabled={selectedIndex >= filteredResults.length - 1} className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 disabled:opacity-20 rounded transition-colors" title="Next (↓)">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </SheetHeader>

              {/* Sticky: Input + Output */}
              <div className="shrink-0 border-b border-zinc-800/60 px-5 py-3 space-y-3">
                {(() => {
                  const input = getInputText(selectedResult.row as Record<string, unknown>);
                  if (input === "—") return null;
                  return (
                    <section>
                      <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Input</h4>
                      <div className="text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap bg-zinc-900/60 border border-zinc-800/40 rounded-md p-3 max-h-[120px] overflow-y-auto">
                        {input}
                      </div>
                    </section>
                  );
                })()}
                {(() => {
                  const gtRaw = (selectedResult.row as Record<string, unknown> | undefined)?.ground_truth;
                  if (gtRaw == null || gtRaw === "") return null;
                  const gt = typeof gtRaw === "string" ? gtRaw : JSON.stringify(gtRaw);
                  return (
                    <section>
                      <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Ground Truth</h4>
                      <div className="text-[11px] text-emerald-300/80 leading-relaxed whitespace-pre-wrap bg-zinc-900/60 border border-zinc-800/40 rounded-md p-3 max-h-[120px] overflow-y-auto">
                        {gt}
                      </div>
                    </section>
                  );
                })()}
                {(() => {
                  const output = getOutputText(selectedResult.row as Record<string, unknown>);
                  if (!output) return null;
                  return (
                    <section>
                      <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Model Output</h4>
                      <div className="text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap bg-zinc-900/60 border border-zinc-800/40 rounded-md p-3 max-h-[120px] overflow-y-auto">
                        {output}
                      </div>
                    </section>
                  );
                })()}
              </div>

              {/* Scrollable: Epoch score history */}
              {panelEpochData && panelEpochData.epochs.length > 0 && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="shrink-0 px-5 pt-3 pb-1.5">
                    <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Score History ({panelEpochData.epochs.length} evaluations)
                    </h4>
                  </div>
                  <div className="flex-1 overflow-y-auto px-5 pb-4">
                    <div className="border border-zinc-800/40 rounded-md overflow-hidden">
                      <EpochScoresTable epochs={panelEpochData.epochs} criteriaNames={panelEpochData.criteriaNames} compact />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
