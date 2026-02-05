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
import { ResultsView, type ResultsViewTab } from "./ResultsView";
import { RunningView } from "./RunningView";
import { VerdictBadge } from "./VerdictBadge";
import { useDryRunJobs } from "@/contexts/DryRunJobsContext";
import { cn } from "@/lib/utils";
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

/**
 * Get a sensible default sample size based on record count
 */
function getDefaultSampleSize(recordCount: number): number {
  if (recordCount <= 10) return recordCount;
  if (recordCount <= 50) return Math.min(25, recordCount);
  if (recordCount <= 200) return 50;
  return 100;
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
  const [sampleSize, setSampleSize] = useState(() => getDefaultSampleSize(recordCount));
  const [rolloutModel, setRolloutModel] = useState("gpt-4o-mini");
  const [activeTab, setActiveTab] = useState<ResultsViewTab>("overview");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Update sampleSize when recordCount changes (e.g., when switching datasets)
  useEffect(() => {
    setSampleSize(getDefaultSampleSize(recordCount));
  }, [recordCount]);

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
      await startDryRun(sampleSize, rolloutModel);
      setView("running");
    } catch (error) {
      console.error("Failed to start dry run:", error);
    }
  }, [hasGraderConfig, sampleSize, rolloutModel, startDryRun]);

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
      <DialogContent className="max-w-[70vw] h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            Dry Run Validation
            {/* Only show verdict when viewing results, not during running */}
            {view === "results" && result && (
              <VerdictBadge verdict={result.diagnosis.verdict} />
            )}
            {view === "running" && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                Running...
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Test the grader on sample data to validate dataset and grader quality
          </DialogDescription>
        </DialogHeader>

        <div className={cn(
          "flex-1 min-h-0 py-2",
          (view === "results" || view === "config" || view === "running") ? "flex flex-col" : "overflow-y-auto space-y-4"
        )}>
          {/* Config view */}
          {view === "config" && (
            <ConfigView
              recordCount={recordCount}
              hasGraderConfig={hasGraderConfig}
              sampleSize={sampleSize}
              onSampleSizeChange={setSampleSize}
              rolloutModel={rolloutModel}
              onRolloutModelChange={setRolloutModel}
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
              evaluationResults={displayJob?.pollingSnapshot?.results}
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
