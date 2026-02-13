/**
 * PlanCard
 *
 * Compact plan summary card rendered in Lucy sidebar chat.
 * Shows key stats and action buttons for the proposed plan.
 */

import { Sparkles, Eye, Pencil, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupPlanConsumer } from "@/contexts/SetupPlanContext";

export function PlanCard() {
  const {
    proposedPlan,
    isPlanPreviewActive,
    approvePlan,
    dismissPlan,
    setIsPlanPreviewActive,
    setPlanEditMode,
  } = SetupPlanConsumer();

  if (!proposedPlan) return null;

  // Extract summary stats
  const topicCount = proposedPlan.total_topic_count || proposedPlan.proposed_topics.length;
  const recordTarget = proposedPlan.estimated_records;
  const criteriaCount = proposedPlan.grader_config?.criteria?.length ?? 0;
  const estimatedDuration = proposedPlan.estimated_duration;

  const handleViewPlan = () => {
    setIsPlanPreviewActive(true);
    setPlanEditMode("display");
  };

  const handleEdit = () => {
    setIsPlanPreviewActive(true);
    setPlanEditMode("edit");
  };

  const handleApprove = () => {
    approvePlan(proposedPlan);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[rgb(var(--theme-500))]" />
        <span className="text-xs font-semibold text-foreground">Setup Plan</span>
      </div>

      {/* Stats */}
      <div className="text-[11px] text-muted-foreground space-y-0.5">
        <div>{topicCount} topic{topicCount !== 1 ? "s" : ""} &middot; {recordTarget} records</div>
        {criteriaCount > 0 && (
          <div>{criteriaCount} eval criteri{criteriaCount !== 1 ? "a" : "on"}</div>
        )}
        {estimatedDuration && (
          <div>~{estimatedDuration}</div>
        )}
      </div>

      {/* Action buttons */}
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

      {/* View Plan link — always visible so user can navigate to plan preview */}
      <button
        onClick={handleViewPlan}
        className="flex items-center gap-1 text-[11px] text-[rgb(var(--theme-500))] hover:underline w-full"
      >
        <Eye className="w-3 h-3" />
        {isPlanPreviewActive ? "Viewing full plan" : "View full plan"}
      </button>
    </div>
  );
}
