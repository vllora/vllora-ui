/**
 * ResultsView
 *
 * Displays dry run results with tabs for overview, topics, and samples.
 */

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, XCircle, History, RefreshCw, AlertTriangle, ArrowRight } from "lucide-react";
import { ScoreHistogram } from "./ScoreHistogram";
import { SampleCard } from "./SampleCard";
import { ResultsTable } from "./ResultsTable";
import { cn } from "@/lib/utils";
import type { DryRunStats } from "@/types/dataset-types";
import type { FlatEvaluationResult } from "@/services/finetune-api";

export type ResultsViewTab = "overview" | "samples" | "topics" | "details";

interface ResultsViewProps {
  result: DryRunStats;
  scores: number[];
  activeTab: ResultsViewTab;
  onTabChange: (tab: ResultsViewTab) => void;
  onReset: () => void;
  onViewHistory: () => void;
  onClose?: () => void;
  hasHistory: boolean;
  /** Full evaluation results for details tab (flattened from epoch-based) */
  evaluationResults?: FlatEvaluationResult[];
}

export function ResultsView({
  result,
  scores,
  activeTab,
  onTabChange,
  onReset,
  onViewHistory,
  hasHistory,
  evaluationResults,
}: ResultsViewProps) {
  const byTopic = result.byTopic || {};
  const recommendations = result.diagnosis.recommendations || [];
  const sampleResults = result.sampleResults || { highest: [], lowest: [], aroundMean: [] };

  // Count errors and successes from evaluation results
  const { errorCount, successCount, totalCount } = useMemo(() => {
    if (!evaluationResults) return { errorCount: 0, successCount: 0, totalCount: 0 };
    const errors = evaluationResults.filter(
      (r) => r.status === "failed" || !!r.error_message
    ).length;
    const total = evaluationResults.length;
    return { errorCount: errors, successCount: total - errors, totalCount: total };
  }, [evaluationResults]);

  // Check if we should show error-focused view (>50% errors or all errors)
  const showErrorView = totalCount > 0 && (errorCount / totalCount) > 0.5;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Tabs - scrollable content area */}
      <div className="flex-1 min-h-0 flex flex-col">
        <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as ResultsViewTab)} className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid w-full grid-cols-4 shrink-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="topics">By Topic</TabsTrigger>
          <TabsTrigger value="samples">Samples</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="space-y-4 mt-4 overflow-y-auto">
          {showErrorView ? (
            /* Error-focused view when most evaluations failed */
            <div className="space-y-4">
              {/* Error summary card */}
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <h3 className="text-sm font-medium text-red-400">
                      {errorCount === totalCount ? "All" : "Most"} evaluations failed
                    </h3>
                    <p className="text-xs text-zinc-400">
                      {errorCount} of {totalCount} evaluations encountered errors.
                      This usually indicates an issue with the grader configuration.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onTabChange("details")}
                      className="mt-2 h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                    >
                      View error details
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Quick stats - show what we have */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-2.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Total</p>
                  <p className="text-base font-mono font-semibold text-zinc-200 mt-0.5">{totalCount}</p>
                </div>
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-red-400">Failed</p>
                  <p className="text-base font-mono font-semibold text-red-400 mt-0.5">{errorCount}</p>
                </div>
                <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-2.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Success</p>
                  <p className="text-base font-mono font-semibold text-[rgb(var(--theme-400))] mt-0.5">{successCount}</p>
                </div>
              </div>

              {/* Error-specific guidance */}
              <div className="rounded-md bg-zinc-900/50 border border-zinc-800 p-3 space-y-2">
                <p className="text-sm font-medium text-zinc-300">How to fix:</p>
                <ul className="text-xs text-zinc-500 space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="text-zinc-600">1.</span>
                    <span>Check the <strong className="text-zinc-400">Details</strong> tab for specific error messages</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-zinc-600">2.</span>
                    <span>Verify your grader script has no syntax errors</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-zinc-600">3.</span>
                    <span>Ensure all required variables (e.g., <code className="text-zinc-400">model</code>) are configured</span>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            /* Normal stats view when evaluations succeeded */
            <>
              {scores.length > 0 && (
                <ScoreHistogram scores={scores} showMean showStats resultDiagnosis={result.diagnosis} />
              )}

              {/* Recommendations */}
              {recommendations.length > 0 && (
                <div className="rounded-md bg-zinc-900/50 border border-zinc-800 p-3 space-y-2">
                  <p className="text-sm font-medium text-zinc-300">Recommendations:</p>
                  <ul className="text-xs text-zinc-500 space-y-1">
                    {recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-zinc-600">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* By Topic tab */}
        <TabsContent value="topics" className="space-y-3 mt-4 overflow-y-auto">
          {Object.entries(byTopic).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(byTopic)
                .sort(([, a], [, b]) => b.mean - a.mean)
                .map(([topic, data]) => (
                  <div
                    key={topic}
                    className="flex items-center justify-between p-2.5 rounded-md border border-zinc-800 bg-zinc-900/50"
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{topic}</p>
                      <p className="text-xs text-zinc-500">
                        {data.count} samples
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-24 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            data.mean < 0.3
                              ? "bg-red-500"
                              : data.mean < 0.5
                              ? "bg-amber-500"
                              : "bg-[rgb(var(--theme-500))]"
                          )}
                          style={{ width: `${data.mean * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-mono font-medium text-zinc-300 w-12 text-right tabular-nums">
                        {data.mean.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-zinc-400">No topic data available</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-[280px]">
                Records need to be categorized into topics to see per-topic breakdown.
                Define a topic hierarchy and categorize your records first.
              </p>
            </div>
          )}
        </TabsContent>

        {/* Samples tab - shows best/worst examples for manual review */}
        <TabsContent value="samples" className="mt-4 flex-1 relative">
          <div className="absolute inset-0 flex flex-col">
            {sampleResults.highest.length === 0 && sampleResults.lowest.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center flex-1">
                <p className="text-sm text-zinc-400">No sample scores available</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {showErrorView
                    ? "All evaluations failed — fix grader issues first"
                    : "Run a dry run to see sample scores"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
                {/* High scores */}
                <div className="flex flex-col min-h-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--theme-400))] mb-2 shrink-0">
                    <CheckCircle2 className="h-4 w-4" />
                    Highest Scores
                    <span className="text-xs text-zinc-500 font-normal">
                      (best performing samples)
                    </span>
                  </div>
                  <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                    {sampleResults.highest.slice(0, 10).map((sample, i) => (
                      <SampleCard key={i} sample={sample} />
                    ))}
                  </div>
                </div>

                {/* Low scores */}
                <div className="flex flex-col min-h-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-red-400 mb-2 shrink-0">
                    <XCircle className="h-4 w-4" />
                    Lowest Scores
                    <span className="text-xs text-zinc-500 font-normal">
                      (needs attention)
                    </span>
                  </div>
                  <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                    {sampleResults.lowest.slice(0, 10).map((sample, i) => (
                      <SampleCard key={i} sample={sample} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Details tab - full results table */}
        <TabsContent value="details" className="mt-4 flex-1 relative">
          <div className="absolute inset-0 flex flex-col">
            {evaluationResults && evaluationResults.length > 0 ? (
              <ResultsTable results={evaluationResults} fillHeight />
            ) : (
              <p className="text-sm text-zinc-500 text-center py-4">
                No detailed results available
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
      </div>

      {/* Footer - sticky at bottom */}
      <div className="shrink-0 pt-4 space-y-4">
        <Separator className="bg-zinc-800" />

        {/* Footer - refined dark theme design */}
      <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        {/* Left side - Status indicator */}
        <div className="flex items-center gap-2.5">
          {errorCount > 0 ? (
            <>
              <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm text-zinc-400">
                {errorCount} error{errorCount !== 1 ? "s" : ""} detected
              </span>
            </>
          ) : (
            <>
              <div className="h-2 w-2 rounded-full bg-[rgb(var(--theme-500))]" />
              <span className="text-sm text-zinc-400">
                All evaluations passed
              </span>
            </>
          )}
          {hasHistory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onViewHistory}
              className="ml-1 h-7 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            >
              <History className="h-3 w-3 mr-1" />
              History
            </Button>
          )}
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2">
          <Button
            onClick={onReset}
            size="sm"
            className="h-8 gap-1.5 bg-[rgb(var(--theme-600))] hover:bg-[rgb(var(--theme-500))] text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Run Again
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}
