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
import { useState, useEffect, useMemo } from "react";
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
import type { ExecutionProgress, ExecutionStep, ExecutionStepStatus } from "@/lib/distri-finetune-tools/steps/execute-plan";
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
  executionProgress?: ExecutionProgress | null;
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
  executionProgress,
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
            executionProgress={executionProgress}
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
// Plan markdown with live checkbox updates during execution
// ---------------------------------------------------------------------------

/**
 * Maps execution progress step IDs to plan execution_step indices.
 *
 * Preferred: uses the explicit `step_id` field on each execution_step (added in Feb 2026).
 * Fallback: keyword matching on the step name for legacy plans without step_id.
 */
function buildCompletedStepIndices(
  executionSteps: Plan['execution_steps'],
  progress: ExecutionProgress | null | undefined
): Set<number> | undefined {
  if (!progress || !executionSteps) return undefined;

  // Treat both 'completed' and 'skipped' as done — skipped means the step
  // was already completed in a prior run and didn't need to re-execute
  const doneIds = new Set(
    progress.steps
      .filter(s => s.status === 'completed' || s.status === 'skipped')
      .map(s => s.id)
  );

  if (doneIds.size === 0) return undefined;

  const indices = new Set<number>();
  executionSteps.forEach((step, index) => {
    // Preferred: explicit step_id mapping (reliable, 1:1)
    if (step.step_id) {
      if (doneIds.has(step.step_id)) {
        indices.add(index);
      }
      return;
    }

    // Fallback: keyword matching for legacy plans without step_id
    const lower = step.step.toLowerCase();
    const matched =
      (lower.includes('topic') && (doneIds.has('topics') || doneIds.has('adjust_topics'))) ||
      ((lower.includes('generate') || lower.includes('data')) && doneIds.has('generate')) ||
      ((lower.includes('evaluat') || lower.includes('configur') || lower.includes('grader')) && doneIds.has('grader')) ||
      ((lower.includes('dry') || lower.includes('evaluation')) && doneIds.has('dryrun')) ||
      (lower.includes('upload') && doneIds.has('upload')) ||
      ((lower.includes('fine') || lower.includes('train') || lower.includes('setup')) && doneIds.has('finetune'));

    if (matched) indices.add(index);
  });

  return indices.size > 0 ? indices : undefined;
}

/**
 * Format detail strings for display.
 * Converts "Job ID: {full-uuid}" → "Evaluation: eval-{short}" / "Finetune: ft-{short}"
 * to match the short names shown in the Explorer sidebar.
 */
function formatStepDetails(details: string[], stepId: string): string[] {
  const UUID_RE = /^Job ID:\s*([0-9a-f]{6})[0-9a-f-]+$/i;
  return details.map(d => {
    const match = d.match(UUID_RE);
    if (match) {
      const short = match[1];
      if (stepId === 'dryrun') return `Evaluation: eval-${short}`;
      if (stepId === 'finetune') return `Finetune: ft-${short}`;
      return `Job: ${short}`;
    }
    return d;
  });
}

/**
 * Maps execution step indices → detail sub-items + status.
 * Uses progress data when available, falls back to plan data for pending steps.
 */
function buildStepDetails(
  executionSteps: Plan['execution_steps'],
  progress: ExecutionProgress | null | undefined,
  plan: Plan
): Map<number, { details: string[]; status: ExecutionStepStatus }> | undefined {
  if (!executionSteps?.length) return undefined;

  const result = new Map<number, { details: string[]; status: ExecutionStepStatus }>();

  // Build lookup: step_id → progress step (for matching)
  const progressById = new Map<string, ExecutionStep>();
  if (progress?.steps) {
    for (const s of progress.steps) {
      progressById.set(s.id, s);
    }
  }

  // Keyword-based matching for legacy plans without step_id.
  // Order matters: "dryrun" must come before "grader" because
  // "Run evaluation" contains "evaluat" which would match the grader keywords.
  const STEP_KEYWORDS: [string, string[]][] = [
    ['topics', ['topic']],
    ['adjust_topics', ['adjust']],
    ['categorize', ['categoriz']],
    ['generate', ['generate', 'data']],
    ['dryrun', ['dry', 'run evaluation', 'run eval']],
    ['grader', ['evaluat', 'configur', 'grader', 'quality']],
    ['upload', ['upload']],
    ['finetune', ['fine', 'train', 'setup']],
  ];

  executionSteps.forEach((step, index) => {
    // Find matching progress step
    let progressStep: ExecutionStep | undefined;
    let matchedStepId = step.step_id || '';

    if (step.step_id) {
      progressStep = progressById.get(step.step_id);
    } else {
      // Keyword fallback
      const lower = step.step.toLowerCase();
      for (const [stepId, keywords] of STEP_KEYWORDS) {
        if (keywords.some(k => lower.includes(k))) {
          progressStep = progressById.get(stepId);
          matchedStepId = stepId;
          break;
        }
      }
    }

    // If we have progress data with details, use it (formatted for display)
    if (progressStep?.details?.length) {
      result.set(index, {
        details: formatStepDetails(progressStep.details, matchedStepId),
        status: progressStep.status,
      });
      return;
    }

    // For failed steps, show error as detail
    if (progressStep?.status === 'failed' && progressStep.error) {
      result.set(index, {
        details: [progressStep.error],
        status: 'failed',
      });
      return;
    }

    // For running steps, show the message
    if (progressStep?.status === 'running') {
      result.set(index, {
        details: [progressStep.message || 'In progress...'],
        status: 'running',
      });
      return;
    }

    // For pending steps (no progress yet), generate "Target: ..." from plan data
    if (!progressStep || progressStep.status === 'pending') {
      const pendingDetails = buildPendingDetails(step, plan);
      if (pendingDetails.length > 0) {
        result.set(index, {
          details: pendingDetails,
          status: 'pending',
        });
      }
    }
  });

  return result.size > 0 ? result : undefined;
}

/** Generate "Target: ..." detail lines from plan data for pending steps */
function buildPendingDetails(
  step: NonNullable<Plan['execution_steps']>[number],
  plan: Plan
): string[] {
  const lower = step.step.toLowerCase();
  const stepId = step.step_id || '';

  if (stepId === 'topics' || lower.includes('topic')) {
    const count = plan.total_topic_count || plan.proposed_topics?.length || 0;
    return count > 0 ? [`Target: ${count} topics`] : [];
  }

  if (stepId === 'generate' || (lower.includes('generate') || lower.includes('data'))) {
    const records = plan.estimated_records || 0;
    const topicCount = plan.total_topic_count || plan.proposed_topics?.length || 0;
    if (records > 0 && topicCount > 0) {
      return [`Target: ${records} records across ${topicCount} topics`];
    } else if (records > 0) {
      return [`Target: ${records} records`];
    }
    return [];
  }

  // "Run evaluation" / "dry run" must be checked BEFORE generic "evaluat"/"configur"
  // because "Run evaluation" contains "evaluat" which would match the grader branch
  if (stepId === 'dryrun' || lower.includes('dry') || lower.includes('run evaluation') || lower.includes('run eval')) {
    return ['Will evaluate a sample of records'];
  }

  if (stepId === 'grader' || lower.includes('evaluat') || lower.includes('configur') || lower.includes('grader') || lower.includes('quality')) {
    const criteria = plan.grader_config?.criteria ?? [];
    if (criteria.length > 0) {
      const names = criteria.map(c => c.name);
      const display = names.length <= 4
        ? names.join(', ')
        : names.slice(0, 4).join(', ') + `, +${names.length - 4} more`;
      return [`${criteria.length} criteria: ${display}`];
    }
    return [];
  }

  return [];
}

/** User-friendly labels for step IDs not already in execution_steps */
const STEP_DISPLAY_NAMES: Record<string, string> = {
  topics: 'Apply Topics',
  adjust_topics: 'Adjust Topics',
  categorize: 'Categorize Records',
  generate: 'Generate Data',
  grader: 'Configure Evaluator',
  upload: 'Upload Dataset',
  dryrun: 'Run Evaluation',
  finetune: 'Start Finetune Job',
};

/** Steps that are internal/technical and should not appear in the user-facing checklist */
const HIDDEN_STEPS = new Set(['upload', 'adjust_topics', 'categorize']);

/**
 * Augment plan.execution_steps with any executed steps that the agent
 * omitted (e.g. finetune). Returns the original array if nothing
 * is missing, or a new array with synthetic entries appended.
 * Internal steps (upload, adjust_topics, categorize) are excluded.
 */
function augmentExecutionSteps(
  executionSteps: Plan['execution_steps'],
  progress: ExecutionProgress | null | undefined,
  plan: Plan
): Plan['execution_steps'] {
  if (!executionSteps?.length) return executionSteps;

  // Collect step_ids already present in the plan checklist
  const existingIds = new Set<string>();
  for (const s of executionSteps) {
    if (s.step_id) existingIds.add(s.step_id);
  }

  // Collect step_ids that actually ran (from progress) or are scheduled (from plan)
  const executedIds: string[] = [];
  if (progress?.steps) {
    for (const s of progress.steps) {
      // Only include steps that actually did something (not skipped idle steps)
      if (s.status !== 'skipped' && s.status !== 'pending') {
        executedIds.push(s.id);
      }
    }
  }
  // Also check steps_to_execute from the plan (for pre-execution view)
  const plannedIds = (plan.steps_to_execute as string[] | undefined) ?? [];

  // Merge: prefer executed (live) over planned
  const allIds = new Set([...executedIds, ...plannedIds]);

  // Find missing steps (skip hidden internal steps)
  const missing: NonNullable<Plan['execution_steps']> = [];
  for (const id of allIds) {
    if (HIDDEN_STEPS.has(id)) continue;
    if (!existingIds.has(id)) {
      missing.push({
        step: STEP_DISPLAY_NAMES[id] || id,
        step_id: id,
        description: '',
        estimated_time: '',
      });
    }
  }

  // Filter out any existing execution_steps that are hidden internal steps
  const visible = executionSteps.filter(s => !s.step_id || !HIDDEN_STEPS.has(s.step_id));

  if (missing.length === 0 && visible.length === executionSteps.length) return executionSteps;
  return [...visible, ...missing];
}

function PlanMarkdownContent({ plan, executionProgress }: { plan: Plan; executionProgress?: ExecutionProgress | null }) {
  // Augment execution_steps with any missing steps the agent omitted
  // (e.g. upload, finetune) so they appear in the checklist
  const fullExecutionSteps = useMemo(
    () => augmentExecutionSteps(plan.execution_steps, executionProgress, plan),
    [plan.execution_steps, executionProgress, plan]
  );

  const completedStepIndices = useMemo(
    () => buildCompletedStepIndices(fullExecutionSteps, executionProgress),
    [fullExecutionSteps, executionProgress]
  );

  const stepDetails = useMemo(
    () => buildStepDetails(fullExecutionSteps, executionProgress, plan),
    [fullExecutionSteps, executionProgress, plan]
  );

  // Create a plan copy with augmented steps for markdown rendering
  const planForMarkdown = useMemo(
    () => fullExecutionSteps === plan.execution_steps ? plan : { ...plan, execution_steps: fullExecutionSteps },
    [plan, fullExecutionSteps]
  );

  const markdownContent = useMemo(
    () => planToMarkdown(planForMarkdown, { completedStepIndices, stepDetails }),
    [planForMarkdown, completedStepIndices, stepDetails]
  );

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-sm [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_table]:text-xs [&_p]:text-sm [&_li]:text-sm [&_blockquote]:text-sm">
          <LazyMarkdownRenderer content={markdownContent} />
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
  planDiff,
  onModeChange,
  onApprove,
  isExecuting,
  executionProgress,
  isActionable,
}: {
  plan: Plan;
  planStatus: PlanStatus | null;
  planDiff?: PlanDiff | null;
  onModeChange: (mode: "display" | "edit") => void;
  onApprove: (plan: Plan) => void;
  isExecuting: boolean;
  executionProgress?: ExecutionProgress | null;
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

      {/* Plan content — checkboxes update live during execution */}
      <PlanMarkdownContent plan={plan} executionProgress={executionProgress} />

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
