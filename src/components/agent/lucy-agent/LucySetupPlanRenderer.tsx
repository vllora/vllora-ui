/**
 * LucySetupPlanRenderer
 *
 * Custom renderer for the propose_setup_plan and execute_setup_plan tools.
 * Shows the setup plan card with approve button, or execution progress.
 */

import { ToolCall, extractToolResultData } from '@distri/core';
import { ToolCallState } from '@distri/react';
import { Loader2, ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { useState } from 'react';
import { emitter } from '@/utils/eventEmitter';
import { SetupPlanCard, ExecutionProgressCard } from '@/components/datasets/lucy-plan-card';
import type { SetupPlan } from '@/lib/distri-finetune-tools/steps/propose-setup-plan';
import { tryParseJson } from '@/utils/modelUtils';

// Local type definition to avoid circular imports
interface ToolRendererProps {
  toolCall: ToolCall;
  state?: ToolCallState;
}

// Simple fallback renderer (avoids circular import with SimpleFallbackRenderer)
function SimpleFallbackRenderer({ toolCall, state }: ToolRendererProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasInput = toolCall.input && Object.keys(toolCall.input).length > 0;
  const hasResult = state?.result;

  return (
    <div className="border border-border rounded-lg bg-muted/30 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <code className="text-xs font-mono text-foreground">{toolCall.tool_name}</code>
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Wrench className="h-3 w-3" />
          {state?.status || 'Pending'}
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-border px-3 py-2 space-y-2">
          {hasInput && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Input</div>
              <pre className="text-xs bg-background p-2 rounded border overflow-x-auto">
                {JSON.stringify(toolCall.input, null, 2)}
              </pre>
            </div>
          )}
          {hasResult && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Result</div>
              <pre className="text-xs bg-background p-2 rounded border overflow-x-auto max-h-48">
                {typeof state.result === 'string'
                  ? state.result
                  : JSON.stringify(state.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Propose Setup Plan Renderer
// ============================================================================

/**
 * Renderer for propose_setup_plan tool - shows the plan with approve button
 */
export function LucySetupPlanRenderer({ toolCall, state }: ToolRendererProps) {
  const isRunning = state?.status === 'running';
  const isCompleted = state?.status === 'completed';

  // Extract result using distri's extractToolResultData helper
  // This properly handles the ToolResult.parts structure
  const getResultData = (): any => {
    if (!state?.result) return null;

    // Use extractToolResultData to properly extract from ToolResult.parts
    const resultData = extractToolResultData(state.result);
    const rawResult = resultData ? resultData.result : state.result;

    console.log('[LucySetupPlanRenderer] Extracted result:', {
      hasResultData: !!resultData,
      rawResultType: typeof rawResult,
    });

    // If result is a string, try to parse it as JSON
    if (typeof rawResult === 'string') {
      const parsed = tryParseJson(rawResult);
      console.log('[LucySetupPlanRenderer] Parsed string result:', {
        success: parsed?.success,
        hasPlan: !!parsed?.plan,
        keys: parsed ? Object.keys(parsed) : [],
      });
      return parsed ?? rawResult;
    }

    console.log('[LucySetupPlanRenderer] Object result:', {
      success: (rawResult as any)?.success,
      hasPlan: !!(rawResult as any)?.plan,
      keys: rawResult && typeof rawResult === 'object' ? Object.keys(rawResult) : [],
    });
    return rawResult;
  };

  const result = getResultData();

  // If running, show loading state
  if (isRunning) {
    return (
      <div className="border border-border rounded-lg bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Analyzing your documents and creating a setup plan...</span>
        </div>
      </div>
    );
  }

  // If there's a plan, show the SetupPlanCard
  if (isCompleted && result?.success && result?.plan) {
    const plan: SetupPlan = result.plan;

    const handleApprove = (approvedPlan: SetupPlan) => {
      // Emit event to trigger Lucy with approval message
      emitter.emit('vllora_lucy_prompt', {
        prompt: `I approve the setup plan. Please execute it now using the execute_setup_plan tool with the following plan:\n\n${JSON.stringify(approvedPlan)}`,
      });
    };

    return <SetupPlanCard plan={plan} onApprove={handleApprove} />;
  }

  // If sources are still processing, show a waiting message with indicator
  if (isCompleted && result?.success && result?.sources_processing) {
    return (
      <div className="border border-amber-500/30 rounded-lg bg-amber-500/10 p-4">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-medium">Documents still processing</span>
        </div>
        <div className="text-sm text-muted-foreground mt-2">
          {result.message || 'Please wait for document processing to complete, then try again.'}
        </div>
      </div>
    );
  }

  // If requires knowledge sources, show a message
  if (isCompleted && result?.success && result?.requires_knowledge_sources) {
    return (
      <div className="border border-border rounded-lg bg-muted/30 p-4">
        <div className="text-sm text-muted-foreground">
          {result.message || 'Please upload some documents to proceed with the setup plan.'}
        </div>
      </div>
    );
  }

  // Default: show error or fallback
  if (state?.error || (result && !result.success)) {
    console.log('[LucySetupPlanRenderer] Showing error state:', {
      stateError: state?.error,
      resultSuccess: result?.success,
      resultError: result?.error,
    });
    return (
      <div className="border border-destructive/30 rounded-lg bg-destructive/10 p-4">
        <div className="text-sm text-destructive">
          {state?.error || result?.error || 'Failed to generate setup plan'}
        </div>
      </div>
    );
  }

  // Fallback to default renderer
  console.log('[LucySetupPlanRenderer] Falling back to default renderer');
  return <SimpleFallbackRenderer toolCall={toolCall} state={state} />;
}

// ============================================================================
// Execute Setup Plan Renderer
// ============================================================================

/**
 * Renderer for execute_setup_plan tool - shows execution progress
 */
export function LucyExecutePlanRenderer({ toolCall, state }: ToolRendererProps) {
  const isRunning = state?.status === 'running';
  const isCompleted = state?.status === 'completed';

  // Extract result using distri's extractToolResultData helper
  const getResultData = (): any => {
    if (!state?.result) return null;

    const resultData = extractToolResultData(state.result);
    const rawResult = resultData ? resultData.result : state.result;

    console.log('[LucyExecutePlanRenderer] Extracted result:', {
      hasResultData: !!resultData,
      rawResultType: typeof rawResult,
    });

    if (typeof rawResult === 'string') {
      const parsed = tryParseJson(rawResult);
      console.log('[LucyExecutePlanRenderer] Parsed result:', {
        success: parsed?.success,
        hasFinalStatus: !!parsed?.final_status,
      });
      return parsed ?? rawResult;
    }

    return rawResult;
  };

  const result = getResultData();

  // Show progress card (it listens to events for updates)
  if (isRunning || (isCompleted && result?.final_status)) {
    return (
      <ExecutionProgressCard
        initialProgress={result?.final_status}
        onComplete={(progress) => {
          console.log('[LucyExecutePlanRenderer] Execution complete:', progress);
        }}
      />
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
