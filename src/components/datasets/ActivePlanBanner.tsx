/**
 * ActivePlanBanner
 *
 * Banner shown between header and tabs when a plan exists
 * but workspace is NOT showing the plan tab.
 * During execution shows step progress instead of View/Edit.
 */

import { Sparkles, Eye, Pencil, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlanConsumer } from "@/contexts/PlanContext";
import { WorkspaceTabsConsumer } from "@/contexts/WorkspaceTabsContext";
import { mapTabPathToSection } from "./TabContentRouter";

export function ActivePlanBanner() {
  const {
    hasPlanProposed,
    proposedPlan,
    isExecuting,
    executionProgress,
    setPlanEditMode,
    cancelExecution,
  } = PlanConsumer();

  const { activeTabPath, openTab } = WorkspaceTabsConsumer();

  // Don't show banner when plan tab is active (workspace already shows plan)
  const isPlanTabActive = mapTabPathToSection(activeTabPath) === "plan";
  if (isPlanTabActive) return null;

  // Don't show if no plan and not executing
  if (!hasPlanProposed && !isExecuting) return null;

  const handleView = () => {
    setPlanEditMode("display");
    openTab("plan.md", "plan.md", false);
  };

  const handleEdit = () => {
    setPlanEditMode("edit");
    openTab("plan.md", "plan.md", false);
  };

  // During execution
  if (isExecuting && executionProgress) {
    const { current_step, total_steps } = executionProgress;
    return (
      <div className="px-4 py-2 bg-[rgba(var(--theme-500),0.1)] border-b border-[rgba(var(--theme-500),0.2)] flex items-center gap-2 text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-[rgb(var(--theme-500))]" />
        <span className="text-foreground/80 flex-1">
          Plan executing... step {current_step} of {total_steps}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-destructive"
          onClick={cancelExecution}
        >
          <X className="w-3 h-3" />
          Cancel
        </Button>
      </div>
    );
  }

  // Plan proposed — show summary with View/Edit buttons
  const topicCount = proposedPlan?.total_topic_count ?? proposedPlan?.proposed_topics?.length ?? 0;
  const recordTarget = proposedPlan?.estimated_records ?? 0;
  const planLabel = proposedPlan?.title || 'Plan ready';

  return (
    <div className="px-4 py-2 bg-[rgba(var(--theme-500),0.1)] border-b border-[rgba(var(--theme-500),0.2)] flex items-center gap-2 text-xs">
      <Sparkles className="w-3.5 h-3.5 text-[rgb(var(--theme-500))]" />
      <span className="text-foreground/80 flex-1">
        {planLabel}
        {(topicCount > 0 || recordTarget > 0) && (
          <span className="text-muted-foreground">
            {" "}(
            {topicCount > 0 && <>{topicCount} topic{topicCount !== 1 ? "s" : ""}</>}
            {topicCount > 0 && recordTarget > 0 && <> &middot; </>}
            {recordTarget > 0 && <>{recordTarget} records</>}
            )
          </span>
        )}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-[11px] gap-1 border-[rgba(var(--theme-500),0.3)] text-[rgb(var(--theme-500))] hover:bg-[rgba(var(--theme-500),0.1)]"
        onClick={handleView}
      >
        <Eye className="w-3 h-3" />
        View Plan
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-[11px] gap-1 border-[rgba(var(--theme-500),0.3)] text-[rgb(var(--theme-500))] hover:bg-[rgba(var(--theme-500),0.1)]"
        onClick={handleEdit}
      >
        <Pencil className="w-3 h-3" />
        Edit
      </Button>
    </div>
  );
}
