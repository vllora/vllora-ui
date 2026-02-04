/**
 * DryRunDialog
 *
 * Dialog for running dry run validation on dataset + grader.
 * Tests the grader on sample data to assess:
 * 1. Dataset quality - Are the prompts learnable?
 * 2. Grader quality - Does the evaluation function work correctly?
 *
 * Supports background operation - jobs continue running even when dialog is closed.
 */

import { useEffect, useCallback, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FlaskConical } from "lucide-react";
import { ConfigView } from "./ConfigView";
import { HistoryView } from "./HistoryView";
import { ResultsView } from "./ResultsView";
import { RunningView } from "./RunningView";
import { VerdictBadge } from "./VerdictBadge";
import { useDryRunJobs } from "@/contexts/DryRunJobsContext";
import type { DryRunJob } from "@/types/dry-run-job";
import { getJobTotalRows, getJobCompletedRows } from "@/types/dry-run-job";

interface DryRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Number of records available for sampling */
  recordCount: number;
  /** Whether grader is configured */
  hasGraderConfig: boolean;
}

type DialogView = "config" | "running" | "results" | "history";

export function DryRunDialog({
  open,
  onOpenChange,
  recordCount,
  hasGraderConfig,
}: DryRunDialogProps) {
  const {
    jobs,
    runningJob,
    lastCompletedJob,
    startDryRun,
    cancelDryRun,
  } = useDryRunJobs();

  const [view, setView] = useState<DialogView>("config");
  const [sampleSize, setSampleSize] = useState(300);
  const [activeTab, setActiveTab] = useState<"overview" | "samples" | "topics">("overview");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Determine which job to display results for
  const displayJob = useMemo(() => {
    if (selectedJobId) {
      return jobs.find((j) => j.id === selectedJobId) || null;
    }
    return lastCompletedJob;
  }, [selectedJobId, jobs, lastCompletedJob]);

  // Reset view when dialog opens
  useEffect(() => {
    if (open) {
      if (runningJob) {
        setView("running");
      } else if (lastCompletedJob) {
        setView("results");
        setSelectedJobId(lastCompletedJob.id);
      } else {
        setView("config");
      }
      setActiveTab("overview");
    }
  }, [open, runningJob, lastCompletedJob]);

  // Auto-switch to results when running job completes
  useEffect(() => {
    if (view === "running" && !runningJob && lastCompletedJob) {
      setView("results");
      setSelectedJobId(lastCompletedJob.id);
    }
  }, [view, runningJob, lastCompletedJob]);

  const handleRunDryRun = useCallback(async () => {
    if (!hasGraderConfig) return;

    try {
      await startDryRun(sampleSize);
      setView("running");
    } catch (error) {
      console.error("Failed to start dry run:", error);
    }
  }, [hasGraderConfig, sampleSize, startDryRun]);

  const handleCancel = useCallback(async () => {
    if (runningJob) {
      await cancelDryRun(runningJob.id);
      setView("config");
    }
  }, [runningJob, cancelDryRun]);

  const handleReset = useCallback(() => {
    setView("config");
    setSelectedJobId(null);
    setActiveTab("overview");
  }, []);

  const handleViewHistory = useCallback(() => {
    setView("history");
  }, []);

  const handleSelectJob = useCallback((job: DryRunJob) => {
    setSelectedJobId(job.id);
    setView("results");
  }, []);

  // Get result from display job
  const result = displayJob?.result;

  // Calculate progress for running job
  const progress = useMemo(() => {
    if (!runningJob) return 0;
    const totalRows = getJobTotalRows(runningJob);
    const completedRows = getJobCompletedRows(runningJob);
    if (totalRows === 0) return 0;
    return Math.round((completedRows / totalRows) * 100);
  }, [runningJob]);

  // Extract scores for histogram
  const scores = useMemo(() => {
    if (!result) return [];
    // Get scores from the full distribution if available
    const allScores: number[] = [];
    if (result.sampleResults) {
      const { highest, lowest, aroundMean } = result.sampleResults;
      [...(highest || []), ...(lowest || []), ...(aroundMean || [])].forEach((s) => {
        allScores.push(s.score);
      });
    }
    return allScores;
  }, [result]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            Dry Run Validation
            {result && (
              <VerdictBadge verdict={result.diagnosis.verdict} />
            )}
            {runningJob && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                Running...
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Test the grader on sample data to validate dataset and grader quality
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Config view */}
          {view === "config" && (
            <ConfigView
              recordCount={recordCount}
              hasGraderConfig={hasGraderConfig}
              sampleSize={sampleSize}
              onSampleSizeChange={setSampleSize}
              onRunDryRun={handleRunDryRun}
              onViewHistory={handleViewHistory}
              hasHistory={jobs.length > 0}
            />
          )}

          {/* Running view */}
          {view === "running" && runningJob && (
            <RunningView
              job={runningJob}
              progress={progress}
              onCancel={handleCancel}
            />
          )}

          {/* Results view */}
          {view === "results" && result && (
            <ResultsView
              result={result}
              scores={scores}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onReset={handleReset}
              onViewHistory={handleViewHistory}
              onClose={() => onOpenChange(false)}
              hasHistory={jobs.length > 1}
            />
          )}

          {/* History view */}
          {view === "history" && (
            <HistoryView
              jobs={jobs}
              onSelectJob={handleSelectJob}
              onBack={() => setView(lastCompletedJob ? "results" : "config")}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function VerdictBadge({ verdict }: { verdict: string }) {
  return (
    <span
      className={cn(
        "ml-2 px-2 py-0.5 rounded-full text-xs font-bold",
        verdict === "GO"
          ? "bg-green-600 text-white"
          : verdict === "NO-GO"
          ? "bg-red-600 text-white"
          : "bg-amber-600 text-white"
      )}
    >
      {verdict === "GO" ? "GO" : verdict === "NO-GO" ? "NO-GO" : "WARNING"}
    </span>
  );
}

function ResultsView({
  result,
  scores,
  activeTab,
  onTabChange,
  onReset,
  onViewHistory,
  onClose,
  hasHistory,
}: {
  result: DryRunStats;
  scores: number[];
  activeTab: "overview" | "samples" | "topics";
  onTabChange: (tab: "overview" | "samples" | "topics") => void;
  onReset: () => void;
  onViewHistory: () => void;
  onClose: () => void;
  hasHistory: boolean;
}) {
  const byTopic = result.byTopic || {};
  const recommendations = result.diagnosis.recommendations || [];
  const sampleResults = result.sampleResults || { highest: [], lowest: [], aroundMean: [] };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="topics">By Topic</TabsTrigger>
          <TabsTrigger value="samples">Samples</TabsTrigger>
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

function HistoryView({
  jobs,
  onSelectJob,
  onBack,
}: {
  jobs: DryRunJob[];
  onSelectJob: (job: DryRunJob) => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Dry Run History</span>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {jobs.map((job) => (
          <button
            key={job.id}
            className={cn(
              "w-full text-left p-3 rounded-md border bg-card hover:bg-muted/50 transition-colors",
              job.status === "running" && "border-blue-500/50"
            )}
            onClick={() => job.status === "completed" && onSelectJob(job)}
            disabled={job.status !== "completed"}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {job.status === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                ) : job.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : job.status === "failed" ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {job.sampleSize} samples
                </span>
              </div>
              {job.result && (
                <VerdictBadge verdict={job.result.diagnosis.verdict} />
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
              <span>{new Date(job.createdAt).toLocaleString()}</span>
              {job.status === "running" && (
                <span>{getJobCompletedRows(job)} / {getJobTotalRows(job)}</span>
              )}
              {job.status === "failed" && job.error && (
                <span className="text-red-500 truncate max-w-[200px]">{job.error}</span>
              )}
            </div>
          </button>
        ))}
      </div>

      <Separator />

      <div className="flex justify-start">
        <Button variant="outline" size="sm" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-2 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-mono font-medium">{value}</p>
    </div>
  );
}

/** Sample card for displaying individual samples */
function SampleCard({
  sample,
}: {
  sample: { recordId: string; score: number; reason?: string };
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border bg-card p-2 text-xs">
      <div className="flex items-center justify-between mb-1">
        <span
          className={cn(
            "font-mono px-1.5 py-0.5 rounded",
            sample.score < 0.3
              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              : sample.score < 0.7
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          )}
        >
          {sample.score.toFixed(2)}
        </span>
      </div>
      <p className="text-muted-foreground line-clamp-2 text-xs">
        Record: {sample.recordId.slice(0, 8)}...
      </p>
      {sample.reason && (
        <>
          {expanded && (
            <div className="mt-2 p-2 rounded bg-muted/50">
              <p className="font-medium mb-1">Reasoning:</p>
              <p className="text-muted-foreground">{sample.reason}</p>
            </div>
          )}
          <button
            className="text-primary text-xs mt-1 hover:underline"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide reasoning" : "Show reasoning"}
          </button>
        </>
      )}
    </div>
  );
}
