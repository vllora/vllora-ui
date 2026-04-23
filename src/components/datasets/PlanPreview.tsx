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

import { Sparkles, Loader2, FolderOpen, AlertCircle, CheckCircle2, XCircle, Pencil, FileText, Download } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useChatStateStore } from "@distri/react";
import { PlanEditor } from "./plan-section/PlanEditor";
import LazyMarkdownRenderer from "@/components/chat/LazyMarkdownRenderer";
import { emitter } from "@/utils/eventEmitter";
import type { Plan } from "@/lib/distri-finetune-tools/steps/propose-plan";
import { IS_LUCY_ENABLED } from "@/lib/feature-flags";
import type { PlanStatus } from "@/lib/distri-finetune-tools/steps/proposed-plan-store";
import { WorkspaceTabsConsumer } from "@/contexts/WorkspaceTabsContext";
// KnowledgeSourcesConsumer removed — skill-first mode has no processing state
import { workflowService } from "@/services/service-registry";
import { generateSkillPackageHandler } from "@/lib/distri-finetune-tools/steps/generate-skill-package";
import { downloadSkillPackageHandler } from "@/lib/distri-finetune-tools/steps/download-skill-package";

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
  /** Documents are being processed and plan will auto-generate when ready */
  docsProcessing?: boolean;
  /** Dataset ID — needed for skill package download */
  workflowId?: string;
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
  docsProcessing,
  workflowId,
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
            isExecuting={isExecuting}
            isActionable={isActionable}
            planErrorMessage={planErrorMessage}
            workflowId={workflowId}
          />
        )
      ) : (
        <PlanEmptyView
          isGenerating={isGenerating}
          hasKnowledgeSources={hasKnowledgeSources}
          onOpenDocs={onOpenDocs}
          docsProcessing={docsProcessing}
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
  isExecuting,
  isActionable,
  planErrorMessage,
  workflowId,
}: {
  plan: Plan;
  planStatus: PlanStatus | null;
  onModeChange: (mode: "display" | "edit") => void;
  isExecuting: boolean;
  isActionable: boolean;
  planErrorMessage?: string | null;
  workflowId?: string;
}) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadSkillPackage = useCallback(async () => {
    if (!workflowId) {
      toast.error('No dataset selected');
      return;
    }
    setIsDownloading(true);
    try {
      const workflow = await workflowService.getByDataset(workflowId);
      if (!workflow) {
        toast.error('No workflow found for this dataset');
        return;
      }
      const genResult = await generateSkillPackageHandler({ workflow_id: workflow.id }) as { success: boolean; error?: string };
      if (!genResult.success) {
        toast.error(genResult.error ?? 'Failed to generate skill package');
        return;
      }
      const dlResult = await downloadSkillPackageHandler({ workflow_id: workflow.id }) as { success: boolean; error?: string };
      if (!dlResult.success) {
        toast.error(dlResult.error ?? 'Failed to download skill package');
        return;
      }
      toast.success('Skill package downloaded');
    } catch {
      toast.error('Download failed');
    } finally {
      setIsDownloading(false);
    }
  }, [workflowId]);

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
          {planStatus === 'completed' && workflowId && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={isDownloading}
              onClick={handleDownloadSkillPackage}
            >
              {isDownloading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Download className="w-3.5 h-3.5" />}
              Skill Package
            </Button>
          )}
          {isActionable && !isExecuting && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => onModeChange("edit")}
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Button>
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
  docsProcessing,
}: {
  isGenerating: boolean;
  hasKnowledgeSources: boolean;
  onOpenDocs?: () => void;
  docsProcessing?: boolean;
}) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Detect when Lucy is actively streaming (covers the gap between the user
  // asking for a plan and Lucy actually calling propose_plan — e.g. she may
  // run get_workflow_state or analyze_knowledge_sources first).
  const isLucyStreaming = useChatStateStore((state) => state.isStreaming);

  // In skill-first mode, sources are always ready (no processing state)

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
          {docsProcessing ? (
            /* Documents are still being processed — show a clear processing state
               so the user knows the system is working, not stuck. */
            <>
              <div className="mx-auto w-12 h-12 rounded-full bg-[rgba(var(--theme-500),0.1)] flex items-center justify-center relative">
                <FileText className="w-6 h-6 text-[rgb(var(--theme-500))]" />
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-background flex items-center justify-center">
                  <Loader2 className="w-3 h-3 animate-spin text-[rgb(var(--theme-500))]" />
                </div>
              </div>
              <div>
                <h3 className="text-base font-medium text-foreground mb-1">
                  Processing your documents
                </h3>
                <p className="text-sm text-muted-foreground">
                  Lucy will create a plan once extraction is ready.
                </p>
              </div>
              {/* Per-source progress (no-op in skill-first mode — sources are always ready) */}
            </>
          ) : showLoading ? (
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
                  {IS_LUCY_ENABLED
                    ? "Let Lucy create a plan with topics, data generation strategy, and evaluation criteria."
                    : "Use the finetune skill from your CLI to generate a plan for this workflow."}
                </p>
              </div>
              {IS_LUCY_ENABLED && hasTimedOut && (
                <div className="flex items-center justify-center gap-2 text-sm text-amber-500">
                  <AlertCircle className="w-4 h-4" />
                  <span>Lucy doesn't seem to be responding.</span>
                </div>
              )}
              {IS_LUCY_ENABLED && (
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
              )}
              {IS_LUCY_ENABLED && (
                <p className="text-xs text-muted-foreground">
                  You can also ask Lucy directly in the chat
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
