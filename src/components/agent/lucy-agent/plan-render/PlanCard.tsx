/**
 * PlanCard
 *
 * Compact plan summary card rendered in Lucy sidebar chat.
 * Shows key stats and action buttons for the proposed plan.
 */

import { Sparkles, Eye, Pencil, X, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRequest } from "ahooks";
import { PlanConsumer } from "@/contexts/PlanContext";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { WorkspaceTabsConsumer } from "@/contexts/WorkspaceTabsContext";
import { mapTabPathToSection } from "@/components/datasets/TabContentRouter";
import { getIterationState, type IterationHistoryEntry } from "@/services/finetune-iteration-db";

const STALL_THRESHOLD = 0.03;

function computeStallCount(history: readonly IterationHistoryEntry[]): number {
  if (history.length < 2) return 0;
  let count = 0;
  for (let i = history.length - 1; i > 0; i--) {
    const delta = Math.abs(history[i].dryRunScores.mean - history[i - 1].dryRunScores.mean);
    if (delta < STALL_THRESHOLD) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

export function PlanCard() {
  const {
    proposedPlan,
    planStatus,
    approvePlan,
    dismissPlan,
    setPlanEditMode,
  } = PlanConsumer();

  const { datasetId } = DatasetDetailConsumer();
  const { activeTabPath, openTab } = WorkspaceTabsConsumer();

  const { data: iterationState } = useRequest(
    async () => {
      if (!datasetId) return null;
      return getIterationState(datasetId);
    },
    { refreshDeps: [datasetId] },
  );

  const stallCount = computeStallCount(iterationState?.history ?? []);
  const hasStallWarning = stallCount >= 2;

  if (!proposedPlan) return null;

  const isPlanTabActive = mapTabPathToSection(activeTabPath) === "plan";

  // Extract summary stats
  const topicCount = proposedPlan.total_topic_count ?? proposedPlan.proposed_topics?.length ?? 0;
  const recordTarget = proposedPlan.estimated_records ?? 0;
  const criteriaCount = proposedPlan.grader_config?.criteria?.length ?? 0;
  const estimatedDuration = proposedPlan.estimated_duration;

  const handleViewPlan = () => {
    setPlanEditMode("display");
    openTab("plan.md", "plan.md", false);
  };

  const handleEdit = () => {
    setPlanEditMode("edit");
    openTab("plan.md", "plan.md", false);
  };

  const handleApprove = () => {
    approvePlan(proposedPlan);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[rgb(var(--theme-500))]" />
        <span className="text-xs font-semibold text-foreground">
          {proposedPlan.title || 'Plan'}
        </span>
      </div>

      {/* Stats */}
      <div className="text-[11px] text-muted-foreground space-y-0.5">
        {(topicCount > 0 || recordTarget > 0) && (
          <div>
            {topicCount > 0 && <>{topicCount} topic{topicCount !== 1 ? "s" : ""}</>}
            {topicCount > 0 && recordTarget > 0 && <> &middot; </>}
            {recordTarget > 0 && <>{recordTarget} records</>}
          </div>
        )}
        {criteriaCount > 0 && (
          <div>{criteriaCount} eval criteri{criteriaCount !== 1 ? "a" : "on"}</div>
        )}
        {estimatedDuration && (
          <div>~{estimatedDuration}</div>
        )}
      </div>

      {/* Stall warning */}
      {hasStallWarning && (
        <div className={`flex items-center gap-1 text-[11px] font-medium ${stallCount >= 4 ? 'text-destructive' : 'text-amber-500'}`}>
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>
            {stallCount >= 4
              ? `Stalled ${stallCount} iterations \u2014 consider changing approach`
              : `${stallCount} stalled iterations`}
          </span>
        </div>
      )}

      {/* Action buttons — only shown when plan is proposed (not yet approved/executing) */}
      {planStatus === 'proposed' && (
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-7 text-[11px] gap-1 flex-1 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            onClick={handleApprove}
          >
            <Check className="w-3 h-3" />
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] gap-1"
            onClick={handleEdit}
          >
            <Pencil className="w-3 h-3" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={dismissPlan}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* View Plan link — hidden when plan tab is already active */}
      {!isPlanTabActive && (
        <button
          onClick={handleViewPlan}
          className="flex items-center gap-1 text-[11px] text-[rgb(var(--theme-500))] hover:underline w-full"
        >
          <Eye className="w-3 h-3" />
          View full plan
        </button>
      )}
    </div>
  );
}
