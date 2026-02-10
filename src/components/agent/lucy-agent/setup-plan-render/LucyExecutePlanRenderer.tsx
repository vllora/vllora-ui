/**
 * LucyExecutePlanRenderer
 *
 * Renderer for execute_setup_plan tool - shows execution progress.
 */

import { ToolCall, extractToolResultData } from '@distri/core';
import { ToolCallState } from '@distri/react';
import { ExecutionProgressCard } from '@/components/datasets/plan-section';
import { tryParseJson } from '@/utils/modelUtils';
import { SimpleFallbackRenderer } from './SimpleFallbackRenderer';

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
