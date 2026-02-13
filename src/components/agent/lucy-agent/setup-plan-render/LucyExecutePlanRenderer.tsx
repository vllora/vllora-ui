/**
 * LucyExecutePlanRenderer
 *
 * Renderer for execute_setup_plan tool.
 * Shows inline progress checklist in sidebar, or completion card when done.
 */

import { ToolCall, extractToolResultData } from '@distri/core';
import { ToolCallState } from '@distri/react';
import { tryParseJson } from '@/utils/modelUtils';
import { SimpleFallbackRenderer } from './SimpleFallbackRenderer';
import { PlanCompletionCard } from './PlanCompletionCard';
import { SetupPlanConsumer } from '@/contexts/SetupPlanContext';
import { Check, Circle, Loader2, AlertCircle } from 'lucide-react';

// Local type definition to avoid circular imports
interface ToolRendererProps {
  toolCall: ToolCall;
  state?: ToolCallState;
}

/**
 * Renderer for execute_setup_plan tool - shows execution progress
 */
export function LucyExecutePlanRenderer({ toolCall, state }: ToolRendererProps) {
  const isRunning = state?.status === 'running';
  const isCompleted = state?.status === 'completed';

  const { executionProgress, isExecuting } = SetupPlanConsumer();

  // Extract result
  const getResultData = (): any => {
    if (!state?.result) return null;

    const resultData = extractToolResultData(state.result);
    const rawResult = resultData ? resultData.result : state.result;

    if (typeof rawResult === 'string') {
      const parsed = tryParseJson(rawResult);
      return parsed ?? rawResult;
    }

    return rawResult;
  };

  const result = getResultData();

  // Get dataset ID from tool input
  const datasetId = (toolCall.input as any)?.dataset_id as string || '';

  // Completed with final status — show completion card
  if (isCompleted && result?.final_status?.is_complete) {
    return (
      <PlanCompletionCard
        progress={result.final_status}
        datasetId={datasetId}
      />
    );
  }

  // Running or has active execution — show inline progress checklist
  if (isRunning || isExecuting) {
    const progress = executionProgress || result?.final_status;

    if (!progress) {
      return (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Starting setup plan execution...</span>
          </div>
        </div>
      );
    }

    // Filter out skipped steps — only show steps that are actually in this execution
    const activeSteps = progress.steps.filter((s: any) => s.status !== 'skipped');
    const completedCount = activeSteps.filter((s: any) => s.status === 'completed').length;
    const runningIdx = activeSteps.findIndex((s: any) => s.status === 'running');
    const currentStepNum = runningIdx >= 0 ? runningIdx + 1 : completedCount;

    return (
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="text-xs font-medium text-foreground">
          Executing setup plan...
        </div>
        <div className="space-y-1">
          {activeSteps.map((step: any) => (
            <div key={step.name} className="flex items-center gap-2 text-[11px]">
              {step.status === 'completed' ? (
                <Check className="w-3 h-3 text-[rgb(var(--theme-500))] shrink-0" />
              ) : step.status === 'running' ? (
                <Loader2 className="w-3 h-3 animate-spin text-[rgb(var(--theme-500))] shrink-0" />
              ) : step.status === 'failed' ? (
                <AlertCircle className="w-3 h-3 text-destructive shrink-0" />
              ) : (
                <Circle className="w-3 h-3 text-muted-foreground/40 shrink-0" />
              )}
              <span className={
                step.status === 'completed' ? 'text-muted-foreground' :
                step.status === 'running' ? 'text-foreground' :
                step.status === 'failed' ? 'text-destructive' :
                'text-muted-foreground/50'
              }>
                {step.name}
              </span>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground pt-1">
          Step {currentStepNum} of {activeSteps.length}
        </div>
      </div>
    );
  }

  // Error state
  if (state?.error || (result && !result.success)) {
    return (
      <div className="border border-destructive/30 rounded-lg bg-destructive/10 p-4">
        <div className="text-sm text-destructive">
          {state?.error || result?.error || 'Setup plan execution failed'}
        </div>
      </div>
    );
  }

  // Fallback
  return <SimpleFallbackRenderer toolCall={toolCall} state={state} />;
}
