/**
 * PlanCard
 *
 * Compact plan summary card rendered in Lucy sidebar chat.
 * Shows key stats and action buttons for the proposed plan.
 */

import { Sparkles, Eye, Pencil, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PlanConsumer } from "@/contexts/PlanContext";
import { WorkspaceTabsConsumer } from "@/contexts/WorkspaceTabsContext";
import { mapTabPathToSection } from "@/components/datasets/TabContentRouter";

export function PlanCard() {
  const {
    proposedPlan,
    approvePlan,
    dismissPlan,
    setPlanEditMode,
  } = PlanConsumer();

  const { activeTabPath, openTab } = WorkspaceTabsConsumer();

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

      {/* Action buttons */}
      <div className="flex items-center gap-1.5">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              className="h-7 text-[11px] gap-1 flex-1 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            >
              <Check className="w-3 h-3" />
              Approve
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve and execute plan?</AlertDialogTitle>
              <AlertDialogDescription>
                This will start executing the plan. Lucy will configure topics, generate training data, and set up evaluation. This may take several minutes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
                onClick={handleApprove}
              >
                Approve & Execute
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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

      {/* View Plan link — always visible so user can navigate to plan tab */}
      <button
        onClick={handleViewPlan}
        className="flex items-center gap-1 text-[11px] text-[rgb(var(--theme-500))] hover:underline w-full"
      >
        <Eye className="w-3 h-3" />
        {isPlanTabActive ? "Viewing full plan" : "View full plan"}
      </button>
    </div>
  );
}
