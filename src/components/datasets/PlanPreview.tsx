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

import { Sparkles, Loader2, FolderOpen, AlertCircle, CheckCircle2, XCircle, Pencil } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useChatStateStore } from "@distri/react";
import { PlanEditor } from "./plan-section/PlanEditor";
import LazyMarkdownRenderer from "@/components/chat/LazyMarkdownRenderer";
import { emitter } from "@/utils/eventEmitter";
import type { Plan } from "@/lib/distri-finetune-tools/steps/propose-plan";
import type { PlanStatus } from "@/lib/distri-finetune-tools/steps/proposed-plan-store";
import { WorkspaceTabsConsumer } from "@/contexts/WorkspaceTabsContext";

interface PlanPreviewProps {
  plan: Plan | null;
  planStatus: PlanStatus | null;
  mode: "display" | "edit";
  onModeChange: (mode: "display" | "edit") => void;
  onApprove: (plan: Plan) => void;
  onSubmitEdited: (editedMarkdown: string) => void;
  onDismiss: () => void;
  onOpenDocs?: () => void;
  isGenerating: boolean;
  isLoadingPlan: boolean;
  isExecuting: boolean;
  hasKnowledgeSources: boolean;
  planErrorMessage?: string | null;
}

export function PlanPreview({
  plan,
  planStatus,
  mode,
  onModeChange,
  onApprove,
  onSubmitEdited,
  onDismiss,
  onOpenDocs,
  isGenerating,
  isLoadingPlan,
  isExecuting,
  hasKnowledgeSources,
  planErrorMessage,
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
            onApprove={onApprove}
            onSubmitEdited={onSubmitEdited}
            onDismiss={onDismiss}
          />
        ) : (
          <PlanDisplayView
            plan={plan}
            planStatus={planStatus}
            onModeChange={onModeChange}
            onApprove={onApprove}
            isExecuting={isExecuting}
            isActionable={isActionable}
            planErrorMessage={planErrorMessage}
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
// Plan markdown — pure renderer of agent-authored plan_markdown
// ---------------------------------------------------------------------------

function PlanMarkdownContent({ plan }: { plan: Plan }) {
  const { openTab } = WorkspaceTabsConsumer();

  // Intercept clicks on internal navigation links (eval/finetune jobs)
  // and route them through the workspace tab system instead of browser navigation.
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href) return;
    // Internal workspace paths: evaluations/jobs/{id} or finetune/{id}
    if (href.startsWith('evaluations/') || href.startsWith('finetune/')) {
      e.preventDefault();
      openTab(href);
    }
  }, [openTab]);

  return (
    <div className="flex-1 overflow-auto p-6" onClick={handleClick}>
      <div className="max-w-3xl mx-auto">
        <div className="text-sm [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_table]:text-xs [&_p]:text-sm [&_li]:text-sm [&_blockquote]:text-sm">
          <LazyMarkdownRenderer content={plan.plan_markdown} />
        </div>
      </div>
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
  isExecuting,
  isActionable,
  planErrorMessage,
}: {
  plan: Plan;
  planStatus: PlanStatus | null;
  onModeChange: (mode: "display" | "edit") => void;
  onApprove: (plan: Plan) => void;
  isExecuting: boolean;
  isActionable: boolean;
  planErrorMessage?: string | null;
}) {
  return (
    <>
      {/* Plan content — agent updates plan_markdown via update_plan_markdown tool */}
      <PlanMarkdownContent plan={plan} />

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
              <XCircle className="w-3 h-3 shrink-0" />
              <span className="truncate">{planErrorMessage ? 'Failed: ' + planErrorMessage : 'Failed'}</span>
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
              <Button
                size="sm"
                className="h-7 text-xs bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
                onClick={() => onApprove(plan)}
              >
                Approve & Execute
              </Button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function PlanEditView({
  plan,
  onApprove,
  onSubmitEdited,
  onDismiss,
}: {
  plan: Plan;
  onApprove: (plan: Plan) => void;
  onSubmitEdited: (editedMarkdown: string) => void;
  onDismiss: () => void;
}) {
  return (
    <PlanEditor
      plan={plan}
      onApprove={onApprove}
      onSubmitEdited={onSubmitEdited}
      onDismiss={onDismiss}
    />
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

  // Detect when Lucy is actively streaming (covers the gap between the user
  // asking for a plan and Lucy actually calling propose_plan — e.g. she may
  // run get_dataset_state or analyze_knowledge_sources first).
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
  // 3. isLucyStreaming — Lucy is actively streaming (covers the gap before propose_plan fires)
  const showLoading = isGenerating || isRequesting || isLucyStreaming;

  // Distinguish message: "Generating plan..." when we know it's plan-specific,
  // "Lucy is working..." when she's streaming but hasn't hit propose_plan yet
  const isConfirmedPlanGeneration = isGenerating || isRequesting;

  return (
    <>
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
