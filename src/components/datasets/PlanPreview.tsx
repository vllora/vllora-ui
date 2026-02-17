/**
 * PlanPreview
 *
 * Workspace overlay that replaces tab content below the stepper tabs.
 * Tabs remain visible above so the user can click any tab to return.
 *
 * Display mode: rendered markdown with Edit toggle.
 * Edit mode: SetupPlanEditor with Preview toggle + Save/Cancel.
 * Empty state: prompt to generate a plan.
 */

import { Eye, Pencil, Sparkles, Loader2, FolderOpen, AlertCircle, X, CheckCircle2, XCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SetupPlanEditor, planToMarkdown } from "./plan-section/SetupPlanEditor";
import LazyMarkdownRenderer from "@/components/chat/LazyMarkdownRenderer";
import { emitter } from "@/utils/eventEmitter";
import type { SetupPlan } from "@/lib/distri-finetune-tools/steps/propose-setup-plan";
import type { PlanStatus } from "@/lib/distri-finetune-tools/steps/proposed-plan-store";

interface PlanPreviewProps {
  plan: SetupPlan | null;
  planStatus: PlanStatus | null;
  mode: "display" | "edit";
  onModeChange: (mode: "display" | "edit") => void;
  onApprove: (plan: SetupPlan) => void;
  onDismiss: () => void;
  onClose: () => void;
  isGenerating: boolean;
  isLoadingPlan: boolean;
  isExecuting: boolean;
  hasKnowledgeSources: boolean;
}

export function PlanPreview({
  plan,
  planStatus,
  mode,
  onModeChange,
  onApprove,
  onDismiss,
  onClose,
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
            onClose={onClose}
          />
        ) : (
          <PlanDisplayView
            plan={plan}
            planStatus={planStatus}
            onModeChange={onModeChange}
            onApprove={onApprove}
            onClose={onClose}
            isExecuting={isExecuting}
            isActionable={isActionable}
          />
        )
      ) : (
        <PlanEmptyView
          isGenerating={isGenerating}
          hasKnowledgeSources={hasKnowledgeSources}
          onClose={onClose}
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
  onModeChange,
  onApprove,
  onClose,
  isExecuting,
  isActionable,
}: {
  plan: SetupPlan;
  planStatus: PlanStatus | null;
  onModeChange: (mode: "display" | "edit") => void;
  onApprove: (plan: SetupPlan) => void;
  onClose: () => void;
  isExecuting: boolean;
  isActionable: boolean;
}) {
  return (
    <>
      {/* Header toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Sparkles className="w-4 h-4 text-[rgb(var(--theme-500))]" />
          Flow
          {isExecuting && (
            <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Executing...
            </span>
          )}
          {planStatus === 'completed' && (
            <span className="flex items-center gap-1.5 text-xs font-normal text-emerald-600">
              <CheckCircle2 className="w-3 h-3" />
              Completed
            </span>
          )}
          {planStatus === 'failed' && (
            <span className="flex items-center gap-1.5 text-xs font-normal text-red-500">
              <XCircle className="w-3 h-3" />
              Failed
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
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
              <Button
                size="sm"
                className="h-7 text-xs bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
                onClick={() => onApprove(plan)}
              >
                Approve & Execute
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Plan content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-sm [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_table]:text-xs [&_p]:text-sm [&_li]:text-sm [&_blockquote]:text-sm">
            <LazyMarkdownRenderer content={planToMarkdown(plan)} />
          </div>
        </div>
      </div>
    </>
  );
}

function PlanEditView({
  plan,
  onModeChange,
  onApprove,
  onDismiss,
  onClose,
}: {
  plan: SetupPlan;
  onModeChange: (mode: "display" | "edit") => void;
  onApprove: (plan: SetupPlan) => void;
  onDismiss: () => void;
  onClose: () => void;
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
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Editor */}
      <SetupPlanEditor
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
  onClose,
}: {
  isGenerating: boolean;
  hasKnowledgeSources: boolean;
  onClose: () => void;
}) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);

  useEffect(() => {
    if (isGenerating) {
      setIsRequesting(false);
      setHasTimedOut(false);
    }
  }, [isGenerating]);

  useEffect(() => {
    if (!isRequesting) return;

    const handleGenerating = () => {
      setIsRequesting(false);
      setHasTimedOut(false);
    };

    const timeoutId = setTimeout(() => {
      setIsRequesting(false);
      setHasTimedOut(true);
    }, 10000);

    emitter.on("vllora_setup_plan_generating", handleGenerating);
    return () => {
      emitter.off("vllora_setup_plan_generating", handleGenerating);
      clearTimeout(timeoutId);
    };
  }, [isRequesting]);

  const handleGenerate = () => {
    setIsRequesting(true);
    setHasTimedOut(false);
    emitter.emit("vllora_lucy_prompt", {
      prompt: hasKnowledgeSources
        ? `Please analyze the uploaded documents and create a flow for this dataset using the propose_setup_plan tool.`
        : `Please create a flow for this dataset using the propose_setup_plan tool based on the training objective.`,
    });
  };

  const showLoading = isGenerating || isRequesting;

  return (
    <>
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <span className="text-sm font-medium text-foreground">Flow</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </Button>
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
                <h3 className="text-base font-medium text-foreground mb-1">Generating flow...</h3>
                <p className="text-sm text-muted-foreground">
                  Lucy is analyzing your {hasKnowledgeSources ? "documents and " : ""}dataset to create a customized flow.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="mx-auto w-12 h-12 rounded-full bg-[rgba(var(--theme-500),0.1)] flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-[rgb(var(--theme-500))]" />
              </div>
              <div>
                <h3 className="text-base font-medium text-foreground mb-1">No flow yet</h3>
                <p className="text-sm text-muted-foreground">
                  Let Lucy create a flow with topics, data generation strategy, and evaluation criteria.
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
                  {hasTimedOut ? "Retry" : "Generate Flow"}
                </Button>
                {!hasKnowledgeSources && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      onClose();
                      emitter.emit("vllora_open_drawer", { type: "docs" });
                    }}
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
