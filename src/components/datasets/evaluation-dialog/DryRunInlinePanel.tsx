/**
 * DryRunInlinePanel
 *
 * Inline panel for dry run validation, shown alongside the code editor.
 * Replaces the modal DryRunDialog with an integrated side panel.
 * Reuses ConfigView, RunningView, ResultsView, HistoryView from dry-run-dialog.
 */

import { useEffect, useCallback, useMemo, useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { flattenEvaluationResults } from "@/services/finetune-api";
import { ConfigView } from "../dry-run-dialog/ConfigView";
import { HistoryView } from "../dry-run-dialog/HistoryView";
import { ResultsView } from "../dry-run-dialog/ResultsView";
import { RunningView } from "../dry-run-dialog/RunningView";
import { VerdictBadge } from "../dry-run-dialog/VerdictBadge";
import { DryRunJobsConsumer } from "@/contexts/DryRunJobsContext";
import { cn } from "@/lib/utils";
import type { DryRunJob } from "@/types/dry-run-job";
import { getJobTotalRows, getJobCompletedRows } from "@/types/dry-run-job";

function getDefaultSampleSize(recordCount: number): number {
  if (recordCount <= 10) return recordCount;
  if (recordCount <= 50) return Math.min(25, recordCount);
  if (recordCount <= 200) return 50;
  return 100;
}

type PanelView = "config" | "running" | "results" | "history";

interface DryRunInlinePanelProps {
  recordCount: number;
  hasGraderConfig: boolean;
  onClose: () => void;
}

export function DryRunInlinePanel({
  recordCount,
  hasGraderConfig,
  onClose,
}: DryRunInlinePanelProps) {
  const {
    jobs,
    runningJob,
    lastCompletedJob,
    startDryRun,
    cancelDryRun,
  } = DryRunJobsConsumer();

  const [view, setView] = useState<PanelView>("config");
  const [sampleSize, setSampleSize] = useState(() => getDefaultSampleSize(recordCount));
  const [rolloutModel, setRolloutModel] = useState("gpt-4o-mini");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  useEffect(() => {
    setSampleSize(getDefaultSampleSize(recordCount));
  }, [recordCount]);

  const displayJob = useMemo(() => {
    if (selectedJobId) {
      return jobs.find((j) => j.id === selectedJobId) || null;
    }
    return lastCompletedJob;
  }, [selectedJobId, jobs, lastCompletedJob]);

  // Set initial view based on current state
  useEffect(() => {
    if (runningJob) {
      setView("running");
    } else if (lastCompletedJob) {
      setView("results");
      setSelectedJobId(lastCompletedJob.id);
    }
  }, []); // Only on mount

  // Auto-switch to results when running job completes
  useEffect(() => {
    if (view === "running" && !runningJob && lastCompletedJob) {
      setView("results");
      setSelectedJobId(lastCompletedJob.id);
    }
  }, [view, runningJob, lastCompletedJob]);

  // Fallback: if running view has no job, go back to config
  useEffect(() => {
    if (view === "running" && !runningJob && !lastCompletedJob) {
      setView("config");
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
  }, []);

  const handleViewHistory = useCallback(() => {
    setView("history");
  }, []);

  const handleSelectJob = useCallback((job: DryRunJob) => {
    setSelectedJobId(job.id);
    setView("results");
  }, []);

  const result = displayJob?.result;

  const progress = useMemo(() => {
    if (!runningJob) return 0;
    const totalRows = getJobTotalRows(runningJob);
    const completedRows = getJobCompletedRows(runningJob);
    if (totalRows === 0) return 0;
    return Math.round((completedRows / totalRows) * 100);
  }, [runningJob]);

  const scores = useMemo(() => {
    if (!result) return [];
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
    <div className="flex flex-col h-full overflow-hidden bg-background border-l border-zinc-800/60">
      {/* Panel header — compact */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 bg-zinc-900/40 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FlaskConical className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
          <span className="text-xs font-medium text-zinc-300">Dry Run</span>
          {view === "results" && result && (
            <VerdictBadge verdict={result.diagnosis.verdict} />
          )}
          {view === "running" && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400">
              {progress}%
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Panel content */}
      <div className={cn(
        "flex-1 min-h-0 p-3",
        (view === "results" || view === "config" || view === "running") ? "flex flex-col" : "overflow-y-auto space-y-4"
      )}>
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

        {view === "running" && runningJob && (
          <RunningView
            job={runningJob}
            progress={progress}
            onCancel={handleCancel}
          />
        )}

        {view === "results" && result && (
          <ResultsView
            result={result}
            scores={scores}
            onReset={handleReset}
            onViewHistory={handleViewHistory}
            onClose={onClose}
            hasHistory={jobs.length > 1}
            evaluationResults={displayJob?.pollingSnapshot?.results ? flattenEvaluationResults(displayJob.pollingSnapshot.results) : undefined}
          />
        )}

        {view === "history" && (
          <HistoryView
            jobs={jobs}
            onSelectJob={handleSelectJob}
            onBack={() => setView(lastCompletedJob ? "results" : "config")}
          />
        )}
      </div>
    </div>
  );
}
