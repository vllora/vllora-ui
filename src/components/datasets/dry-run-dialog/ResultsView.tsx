/**
 * ResultsView
 *
 * Displays dry run results with tabs for overview, topics, and samples.
 */

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RotateCcw, CheckCircle2, XCircle, History } from "lucide-react";
import { ScoreHistogram } from "../ScoreHistogram";
import { StatCard } from "./StatCard";
import { SampleCard } from "./SampleCard";
import { ResultsTable } from "./ResultsTable";
import { cn } from "@/lib/utils";
import type { DryRunStats } from "@/types/dataset-types";
import type { EvaluationResultResponse } from "@/services/finetune-api";

export type ResultsViewTab = "overview" | "samples" | "topics" | "details";

interface ResultsViewProps {
  result: DryRunStats;
  scores: number[];
  activeTab: ResultsViewTab;
  onTabChange: (tab: ResultsViewTab) => void;
  onReset: () => void;
  onViewHistory: () => void;
  onClose: () => void;
  hasHistory: boolean;
  /** Full evaluation results for details tab */
  evaluationResults?: EvaluationResultResponse["results"];
}

export function ResultsView({
  result,
  scores,
  activeTab,
  onTabChange,
  onReset,
  onViewHistory,
  onClose,
  hasHistory,
  evaluationResults,
}: ResultsViewProps) {
  const byTopic = result.byTopic || {};
  const recommendations = result.diagnosis.recommendations || [];
  const sampleResults = result.sampleResults || { highest: [], lowest: [], aroundMean: [] };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as ResultsViewTab)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="topics">By Topic</TabsTrigger>
          <TabsTrigger value="samples">Samples</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {scores.length > 0 && (
            <ScoreHistogram scores={scores} showMean showStats />
          )}

          {/* Stats summary */}
          <div className="grid grid-cols-4 gap-2">
            <StatCard label="Mean" value={result.statistics.mean.toFixed(2)} />
            <StatCard label="Std Dev" value={result.statistics.std.toFixed(2)} />
            <StatCard label="Min" value={result.statistics.min.toFixed(2)} />
            <StatCard label="Max" value={result.statistics.max.toFixed(2)} />
          </div>

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div className="rounded-md bg-muted/50 border p-3 space-y-2">
              <p className="text-sm font-medium">Recommendations:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                {recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span>*</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>

        {/* By Topic tab */}
        <TabsContent value="topics" className="space-y-3 mt-4">
          {Object.entries(byTopic).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(byTopic)
                .sort(([, a], [, b]) => b.mean - a.mean)
                .map(([topic, data]) => (
                  <div
                    key={topic}
                    className="flex items-center justify-between p-2 rounded-md border bg-card"
                  >
                    <div>
                      <p className="text-sm font-medium">{topic}</p>
                      <p className="text-xs text-muted-foreground">
                        {data.count} samples
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            data.mean < 0.3
                              ? "bg-red-500"
                              : data.mean < 0.5
                              ? "bg-amber-500"
                              : "bg-green-500"
                          )}
                          style={{ width: `${data.mean * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-mono w-12 text-right">
                        {data.mean.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No topic data available
            </p>
          )}
        </TabsContent>

        {/* Samples tab */}
        <TabsContent value="samples" className="space-y-3 mt-4">
          <div className="grid grid-cols-2 gap-4">
            {/* High scores */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Highest Scores
              </div>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {sampleResults.highest.slice(0, 5).map((sample, i) => (
                  <SampleCard key={i} sample={sample} />
                ))}
              </div>
            </div>

            {/* Low scores */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-red-600">
                <XCircle className="h-4 w-4" />
                Lowest Scores
              </div>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {sampleResults.lowest.slice(0, 5).map((sample, i) => (
                  <SampleCard key={i} sample={sample} />
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Details tab - full results table */}
        <TabsContent value="details" className="mt-4">
          {evaluationResults && evaluationResults.length > 0 ? (
            <ResultsTable results={evaluationResults} maxHeight={300} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No detailed results available
            </p>
          )}
        </TabsContent>
      </Tabs>

      <Separator />

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Run Again
          </Button>
          {hasHistory && (
            <Button variant="ghost" size="sm" onClick={onViewHistory}>
              <History className="h-3.5 w-3.5 mr-1.5" />
              History
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          {result.diagnosis.verdict === "GO" && (
            <Button size="sm">
              Start Training
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
