/**
 * EvaluationBottomPanel
 *
 * VS Code-style bottom panel for dry run results.
 * Shows the DryRunActivityView split layout with job details on left and job list on right.
 * Running jobs are shown inline in the split view.
 */

import { useEffect, useCallback, useState } from "react";
import {
  Activity,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { DryRunActivityView } from "../dry-run-dialog/DryRunActivityView";
import { DryRunJobsConsumer } from "@/contexts/DryRunJobsContext";
import { cn } from "@/lib/utils";

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

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Set initial selection
  useEffect(() => {
    if (lastCompletedJob && !selectedJobId) {
      setSelectedJobId(lastCompletedJob.id);
    }
  }, [lastCompletedJob, selectedJobId]);

  // Auto-select when running job completes
  useEffect(() => {
    if (!runningJob && lastCompletedJob) {
      setSelectedJobId(lastCompletedJob.id);
    }
  }, [runningJob, lastCompletedJob]);

  const handleCancel = useCallback(async () => {
    if (runningJob) {
      await cancelDryRun(runningJob.id);
    }
  }, [runningJob, cancelDryRun]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Header bar */}
      <div className="flex items-center border-t border-zinc-800/60 bg-zinc-900/40 shrink-0">
        <button
          onClick={() => {
            if (isCollapsed) onToggleCollapse();
          }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors border-b-2 shrink-0",
            !isCollapsed
              ? "border-[rgb(var(--theme-500))] text-zinc-200"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Activity className="w-3 h-3" />
          <span>Activity</span>
          {runningJob ? (
            <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
          ) : jobs.length > 0 ? (
            <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400">
              {jobs.length}
            </span>
          ) : null}
        </button>

        <div className="flex-1" />

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
        <div className="flex-1 min-h-0 flex flex-col">
          <DryRunActivityView
            jobs={jobs}
            onSelectJob={(job) => setSelectedJobId(job.id)}
            onBack={() => {}}
            splitView
            onCancelJob={handleCancel}
            initialSelectedId={selectedJobId}
          />
        </div>
      )}
    </div>
  );
}
