/**
 * PlanPreview
 *
 * Workspace overlay that replaces tab content below the stepper tabs.
 * Tabs remain visible above so the user can click any tab to return.
 *
 * Display mode: rendered markdown with Edit toggle.
 * Edit mode: PlanEditor with Preview toggle + Save/Cancel.
 * Empty state: prompt to generate a plan.
 */

import { Eye, Pencil, Sparkles, Loader2, FolderOpen, AlertCircle, CheckCircle2, XCircle, ArrowLeftRight } from "lucide-react";
import { useState, useEffect } from "react";
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
import { useChatStateStore } from "@distri/react";
import { PlanEditor, planToMarkdown } from "./plan-section/PlanEditor";
import LazyMarkdownRenderer from "@/components/chat/LazyMarkdownRenderer";
import { emitter } from "@/utils/eventEmitter";
import type { Plan } from "@/lib/distri-finetune-tools/steps/propose-plan";
import type { PlanStatus } from "@/lib/distri-finetune-tools/steps/proposed-plan-store";
import type { PlanDiff } from "./plan-section/plan-markdown-utils";

interface PlanPreviewProps {
  plan: Plan | null;
  planStatus: PlanStatus | null;
  planDiff?: PlanDiff | null;
  mode: "display" | "edit";
  onModeChange: (mode: "display" | "edit") => void;
  onApprove: (plan: Plan) => void;
  onDismiss: () => void;
  onOpenDocs?: () => void;
  isGenerating: boolean;
  isLoadingPlan: boolean;
  isExecuting: boolean;
  hasKnowledgeSources: boolean;
}

export function PlanPreview({
  plan,
  planStatus,
  planDiff,
  mode,
  onModeChange,
  onApprove,
  onDismiss,
  onOpenDocs,
  isGenerating,
  isLoadingPlan,
  isExecuting,
  hasKnowledgeSources,
}: PlanPreviewProps) {
  // Show loading spinner while IndexedDB is being read on mount
  if (isLoadingPlan) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[rgb(var(--theme-500))]" />
          <p className="text-sm text-muted-foreground">Loading plan...</p>
        </div>
      </div>
    );
  }

  // Plan is actionable only when proposed (not yet executed/completed/failed)
  const isActionable = planStatus === 'proposed';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {plan ? (
        mode === "edit" && isActionable && !isExecuting ? (
          <PlanEditView
            plan={plan}
            onModeChange={onModeChange}
            onApprove={onApprove}
            onDismiss={onDismiss}
          />
        ) : (
          <PlanDisplayView
            plan={plan}
            planStatus={planStatus}
            planDiff={planDiff}
            onModeChange={onModeChange}
            onApprove={onApprove}
            isExecuting={isExecuting}
            isActionable={isActionable}
          />
        )
      ) : (
        <PlanEmptyView
          isGenerating={isGenerating}
          hasKnowledgeSources={hasKnowledgeSources}
          onOpenDocs={onOpenDocs}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function PlanDisplayView({
  plan,
  planStatus,
  planDiff,
  onModeChange,
  onApprove,
  isExecuting,
  isActionable,
}: {
  plan: Plan;
  planStatus: PlanStatus | null;
  planDiff?: PlanDiff | null;
  onModeChange: (mode: "display" | "edit") => void;
  onApprove: (plan: Plan) => void;
  isExecuting: boolean;
  isActionable: boolean;
}) {
  // Build human-readable diff summary for banner.
  // Skip the banner on the first plan proposal (only additions, no removals/modifications)
  // since "Updated: 6 topics changed" is misleading when nothing existed before.
  const diffParts: string[] = [];
  if (planDiff?.hasChanges) {
    const hasRemovalsOrMods =
      planDiff.topicsRemoved.length > 0 ||
      planDiff.topicsModified.length > 0 ||
      planDiff.criteriaRemoved.length > 0 ||
      planDiff.criteriaModified.length > 0;

    if (hasRemovalsOrMods) {
      const t = planDiff.topicsAdded.length + planDiff.topicsRemoved.length + planDiff.topicsModified.length;
      const c = planDiff.criteriaAdded.length + planDiff.criteriaRemoved.length + planDiff.criteriaModified.length;
      if (t > 0) diffParts.push(`${t} topic${t > 1 ? 's' : ''} changed`);
      if (c > 0) diffParts.push(`${c} ${c > 1 ? 'criteria' : 'criterion'} changed`);
    }
  }

  return (
    <>
      {/* Diff banner — shown when save_plan committed a plan with changes */}
      {planDiff?.hasChanges && diffParts.length > 0 && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 rounded-md border border-blue-500/30 bg-blue-500/10 text-xs">
          <ArrowLeftRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="text-blue-600 dark:text-blue-400">
            <span className="font-medium">Updated: </span>
            {diffParts.join(', ')}
          </span>
        </div>
      )}

      {/* Plan content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-sm [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_table]:text-xs [&_p]:text-sm [&_li]:text-sm [&_blockquote]:text-sm">
            <LazyMarkdownRenderer content={planToMarkdown(plan)} />
          </div>
        </div>
      </div>

      {/* Sticky footer — action buttons + status */}
      {(isActionable || isExecuting || planStatus === 'completed' || planStatus === 'failed') && (
        <div className="flex items-center justify-end px-4 py-2 border-t border-border bg-background/80 backdrop-blur-sm shrink-0 gap-2">
          {isExecuting && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground mr-auto">
              <Loader2 className="w-3 h-3 animate-spin" />
              Executing...
            </span>
          )}
          {planStatus === 'completed' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 mr-auto">
              <CheckCircle2 className="w-3 h-3" />
              Completed
            </span>
          )}
          {planStatus === 'failed' && (
            <span className="flex items-center gap-1.5 text-xs text-red-500 mr-auto">
              <XCircle className="w-3 h-3" />
              Failed
            </span>
          )}
          {isActionable && !isExecuting && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => onModeChange("edit")}
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
                  >
                    Approve & Execute
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
                      onClick={() => onApprove(plan)}
                    >
                      Approve & Execute
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      )}
    </>
  );
}

function PlanEditView({
  plan,
  onModeChange,
  onApprove,
  onDismiss,
}: {
  plan: Plan;
  onModeChange: (mode: "display" | "edit") => void;
  onApprove: (plan: Plan) => void;
  onDismiss: () => void;
}) {
  return (
    <>
      {/* Header toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Pencil className="w-4 h-4 text-[rgb(var(--theme-500))]" />
          Editing Plan
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => onModeChange("display")}
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </Button>
        </div>
      </div>

      {/* Editor */}
      <PlanEditor
        plan={plan}
        onApprove={onApprove}
        onDismiss={onDismiss}
      />
    </>
  );
}

function PlanEmptyView({
  isGenerating,
  hasKnowledgeSources,
  onOpenDocs,
}: {
  isGenerating: boolean;
  hasKnowledgeSources: boolean;
  onOpenDocs?: () => void;
}) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Detect when Lucy is actively streaming (covers manual chat flow
  // where user asks Lucy to create a plan but vllora_plan_generating
  // hasn't fired yet because Lucy is still in early tool calls)
  const isLucyStreaming = useChatStateStore((state) => state.isStreaming);

  useEffect(() => {
    if (isGenerating) {
      setIsRequesting(false);
      setHasTimedOut(false);
      setRetryCount(0);
    }
  }, [isGenerating]);

  useEffect(() => {
    if (!isRequesting) return;

    const handleGenerating = () => {
      setIsRequesting(false);
      setHasTimedOut(false);
    };

    // Progressive timeout: 10s → 30s → 60s
    const timeoutMs = retryCount === 0 ? 10000 : retryCount === 1 ? 30000 : 60000;
    const timeoutId = setTimeout(() => {
      setIsRequesting(false);
      setHasTimedOut(true);
    }, timeoutMs);

    emitter.on("vllora_plan_generating", handleGenerating);
    return () => {
      emitter.off("vllora_plan_generating", handleGenerating);
      clearTimeout(timeoutId);
    };
  }, [isRequesting, retryCount]);

  const handleGenerate = () => {
    setRetryCount((c) => c + 1);
    setIsRequesting(true);
    setHasTimedOut(false);
    emitter.emit("vllora_lucy_prompt", {
      prompt: hasKnowledgeSources
        ? `Please analyze the uploaded documents and create a plan for this dataset using the propose_plan tool.`
        : `Please create a plan for this dataset using the propose_plan tool based on the training objective.`,
    });
  };

  // Show loading when:
  // 1. isGenerating — vllora_plan_generating event fired (propose_plan tool running)
  // 2. isRequesting — user clicked "Generate Plan" button
  // 3. isLucyStreaming — Lucy is actively streaming (covers manual chat requests)
  const showLoading = isGenerating || isRequesting || isLucyStreaming;

  // Distinguish message: "Generating plan..." when we know it's plan-specific,
  // "Lucy is working..." when she's streaming but hasn't hit propose_plan yet
  const isConfirmedPlanGeneration = isGenerating || isRequesting;

  return (
    <>
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <span className="text-sm font-medium text-foreground">Plan</span>
      </div>

      {/* Empty state */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-sm text-center space-y-5">
          {showLoading ? (
            <>
              <div className="mx-auto w-12 h-12 rounded-full bg-[rgba(var(--theme-500),0.1)] flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[rgb(var(--theme-500))]" />
              </div>
              <div>
                <h3 className="text-base font-medium text-foreground mb-1">
                  {isConfirmedPlanGeneration ? "Generating plan..." : "Lucy is working..."}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isConfirmedPlanGeneration
                    ? `Lucy is analyzing your ${hasKnowledgeSources ? "documents and " : ""}dataset to create a customized plan.`
                    : "Lucy is analyzing your dataset. A plan will appear here when ready."}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="mx-auto w-12 h-12 rounded-full bg-[rgba(var(--theme-500),0.1)] flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-[rgb(var(--theme-500))]" />
              </div>
              <div>
                <h3 className="text-base font-medium text-foreground mb-1">No plan yet</h3>
                <p className="text-sm text-muted-foreground">
                  Let Lucy create a plan with topics, data generation strategy, and evaluation criteria.
                </p>
              </div>
              {hasTimedOut && (
                <div className="flex items-center justify-center gap-2 text-sm text-amber-500">
                  <AlertCircle className="w-4 h-4" />
                  <span>Lucy doesn't seem to be responding.</span>
                </div>
              )}
              <div className="flex items-center justify-center gap-3">
                <Button
                  onClick={handleGenerate}
                  className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
                >
                  <Sparkles className="w-4 h-4" />
                  {hasTimedOut ? "Retry" : "Generate Plan"}
                </Button>
                {!hasKnowledgeSources && onOpenDocs && (
                  <Button
                    variant="outline"
                    onClick={onOpenDocs}
                    className="gap-2"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Upload Docs First
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                You can also ask Lucy directly in the chat
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
