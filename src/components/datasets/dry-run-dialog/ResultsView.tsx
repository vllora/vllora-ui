/**
 * ResultsView
 *
 * Single scrollable view of dry run results.
 * Shows score summary, histogram, recommendations, then full results table.
 */

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { History, RefreshCw, AlertTriangle, ArrowDown } from "lucide-react";
import { ScoreHistogram } from "./ScoreHistogram";
import { ResultsTable } from "./ResultsTable";
import { cn } from "@/lib/utils";
import type { DryRunStats } from "@/types/dataset-types";
import type { FlatEvaluationResult } from "@/services/finetune-api";

interface ResultsViewProps {
  result: DryRunStats;
  scores: number[];
  onReset: () => void;
  onViewHistory: () => void;
  onClose?: () => void;
  hasHistory: boolean;
  evaluationResults?: FlatEvaluationResult[];
}

export function ResultsView({
  result,
  scores,
  onReset,
  onViewHistory,
  hasHistory,
  evaluationResults,
}: ResultsViewProps) {
  const recommendations = result.diagnosis.recommendations || [];

  const { errorCount, totalCount } = useMemo(() => {
    if (!evaluationResults) return { errorCount: 0, totalCount: 0 };
    const errors = evaluationResults.filter(
      (r) => r.status === "failed" || !!r.error_message
    ).length;
    return { errorCount: errors, totalCount: evaluationResults.length };
  }, [evaluationResults]);

  const showErrorView = totalCount > 0 && (errorCount / totalCount) > 0.5;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
        {showErrorView ? (
          /* Error-focused view */
          <div className="space-y-3">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-red-400">
                    {errorCount === totalCount ? "All" : "Most"} evaluations failed
                  </p>
                  <p className="text-xs text-zinc-400">
                    {errorCount} of {totalCount} encountered errors. Check your grader script.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-2 text-center">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Total</p>
                <p className="text-sm font-mono font-semibold text-zinc-200 mt-0.5">{totalCount}</p>
              </div>
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-center">
                <p className="text-[10px] uppercase tracking-wider text-red-400">Failed</p>
                <p className="text-sm font-mono font-semibold text-red-400 mt-0.5">{errorCount}</p>
              </div>
              <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-2 text-center">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Passed</p>
                <p className="text-sm font-mono font-semibold text-[rgb(var(--theme-400))] mt-0.5">{totalCount - errorCount}</p>
              </div>
            </div>
          </div>
        ) : (
          /* Normal results view */
          <>
            {scores.length > 0 && (
              <ScoreHistogram scores={scores} showMean showStats resultDiagnosis={result.diagnosis} />
            )}

            {recommendations.length > 0 && (
              <div className="rounded-md bg-zinc-900/50 border border-zinc-800 p-2.5 space-y-1.5">
                <p className="text-xs font-medium text-zinc-400">Recommendations</p>
                <ul className="text-xs text-zinc-500 space-y-1">
                  {recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-zinc-600">-</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {/* Results table — always shown */}
        {evaluationResults && evaluationResults.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <ArrowDown className="w-3 h-3" />
              <span>{evaluationResults.length} evaluation{evaluationResults.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="h-[300px]">
              <ResultsTable results={evaluationResults} fillHeight />
            </div>
          </div>
        )}
      </div>

      {/* Footer — compact action bar */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-zinc-800/60">
        <div className="flex items-center gap-2">
          <span className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            errorCount > 0 ? "bg-red-500" : "bg-emerald-500"
          )} />
          <span className="text-xs text-zinc-500">
            {errorCount > 0
              ? `${errorCount} error${errorCount !== 1 ? "s" : ""}`
              : "All passed"}
          </span>
          {hasHistory && (
            <button
              onClick={onViewHistory}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 ml-1"
            >
              <History className="h-3 w-3" />
              History
            </button>
          )}
        </div>
        <Button
          onClick={onReset}
          size="sm"
          className="h-7 text-xs gap-1.5 bg-[rgb(var(--theme-600))] hover:bg-[rgb(var(--theme-500))] text-white"
        >
          <RefreshCw className="h-3 w-3" />
          Run Again
        </Button>
      </div>
    </div>
  );
}
