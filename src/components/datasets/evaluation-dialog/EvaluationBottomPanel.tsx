/**
 * EvaluationBottomPanel
 *
 * VS Code-style tabbed bottom panel for dry run results.
 * Tabs: Results, History, Running. Config moved to header popover.
 */

import { useEffect, useCallback, useMemo, useState } from "react";
import {
  BarChart3,
  History,
  Play,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { flattenEvaluationResults } from "@/services/finetune-api";
import { HistoryView } from "../dry-run-dialog/HistoryView";
import { ResultsView } from "../dry-run-dialog/ResultsView";
import { RunningView } from "../dry-run-dialog/RunningView";
import { VerdictBadge } from "../dry-run-dialog/VerdictBadge";
import { DryRunJobsConsumer } from "@/contexts/DryRunJobsContext";
import { cn } from "@/lib/utils";
import type { DryRunJob } from "@/types/dry-run-job";
import { getJobTotalRows, getJobCompletedRows } from "@/types/dry-run-job";

type PanelTab = "results" | "history" | "running";

interface TabDef {
  id: PanelTab;
  label: string;
  icon: typeof BarChart3;
}

const TABS: TabDef[] = [
  { id: "results", label: "Results", icon: BarChart3 },
  { id: "history", label: "History", icon: History },
  { id: "running", label: "Running", icon: Play },
];

interface EvaluationBottomPanelProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function EvaluationBottomPanel({
  isCollapsed,
  onToggleCollapse,
}: EvaluationBottomPanelProps) {
  const {
    jobs,
    runningJob,
    lastCompletedJob,
    cancelDryRun,
  } = DryRunJobsConsumer();

  const [activeTab, setActiveTab] = useState<PanelTab>("results");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const displayJob = useMemo(() => {
    if (selectedJobId) {
      return jobs.find((j) => j.id === selectedJobId) || null;
    }
    return lastCompletedJob;
  }, [selectedJobId, jobs, lastCompletedJob]);

  // Set initial tab based on current state
  useEffect(() => {
    if (runningJob) {
      setActiveTab("running");
    } else if (lastCompletedJob) {
      setActiveTab("results");
      setSelectedJobId(lastCompletedJob.id);
    }
  }, []); // Only on mount

  // Auto-switch to results when running job completes
  useEffect(() => {
    if (activeTab === "running" && !runningJob && lastCompletedJob) {
      setActiveTab("results");
      setSelectedJobId(lastCompletedJob.id);
    }
  }, [activeTab, runningJob, lastCompletedJob]);

  // Fallback: if running tab has no job, show results or stay
  useEffect(() => {
    if (activeTab === "running" && !runningJob && !lastCompletedJob) {
      setActiveTab("results");
    }
  }, [activeTab, runningJob, lastCompletedJob]);

  const handleCancel = useCallback(async () => {
    if (runningJob) {
      await cancelDryRun(runningJob.id);
      setActiveTab("results");
    }
  }, [runningJob, cancelDryRun]);

  const handleReset = useCallback(() => {
    setActiveTab("results");
    setSelectedJobId(null);
  }, []);

  const handleViewHistory = useCallback(() => {
    setActiveTab("history");
  }, []);

  const handleSelectJob = useCallback((job: DryRunJob) => {
    setSelectedJobId(job.id);
    setActiveTab("results");
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

  const meanScore = result?.statistics?.mean;

  const getBadge = (tabId: PanelTab) => {
    if (tabId === "results" && meanScore !== undefined) {
      return (
        <span className="px-1 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-800 text-zinc-300">
          {meanScore.toFixed(2)}
        </span>
      );
    }
    if (tabId === "history" && jobs.length > 0) {
      return (
        <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400">
          {jobs.length}
        </span>
      );
    }
    if (tabId === "running" && runningJob) {
      return (
        <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400">
          {progress}%
        </span>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Tab bar */}
      <div className="flex items-center border-t border-zinc-800/60 bg-zinc-900/40 shrink-0">
        <div className="flex items-center gap-0 flex-1 min-w-0">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id && !isCollapsed;
            const Icon = tab.icon;
            const isRunningTab = tab.id === "running";
            const badge = getBadge(tab.id);

            // Hide running tab when no job and not active
            if (isRunningTab && !runningJob && activeTab !== "running") return null;

            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (isCollapsed) onToggleCollapse();
                  setActiveTab(tab.id);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors border-b-2 shrink-0",
                  isActive
                    ? "border-[rgb(var(--theme-500))] text-zinc-200"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                )}
              >
                {isRunningTab && runningJob ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Icon className="w-3 h-3" />
                )}
                <span>{tab.label}</span>
                {badge}
              </button>
            );
          })}

          {/* Verdict badge in tab bar when results exist */}
          {result && activeTab === "results" && !isCollapsed && (
            <div className="ml-1">
              <VerdictBadge verdict={result.diagnosis.verdict} />
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapse}
          className="p-1.5 mr-1 ml-auto rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
          title={isCollapsed ? "Expand panel" : "Collapse panel"}
        >
          {isCollapsed ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Content area */}
      {!isCollapsed && (
        <div className={cn(
          "flex-1 min-h-0",
          activeTab === "history" ? "flex flex-col" : "flex flex-col p-3"
        )}>
          {activeTab === "running" && runningJob && (
            <RunningView
              job={runningJob}
              progress={progress}
              onCancel={handleCancel}
            />
          )}

          {activeTab === "results" && result && (
            <ResultsView
              result={result}
              scores={scores}
              onReset={handleReset}
              onViewHistory={handleViewHistory}
              hasHistory={jobs.length > 1}
              evaluationResults={displayJob?.pollingSnapshot?.results ? flattenEvaluationResults(displayJob.pollingSnapshot.results) : undefined}
            />
          )}

          {activeTab === "results" && !result && (
            <div className="flex items-center justify-center h-full text-xs text-zinc-600">
              No results yet. Run a dry run from the header bar.
            </div>
          )}

          {activeTab === "history" && (
            <HistoryView
              jobs={jobs}
              onSelectJob={handleSelectJob}
              onBack={() => setActiveTab("results")}
              splitView
            />
          )}
        </div>
      )}
    </div>
  );
}
