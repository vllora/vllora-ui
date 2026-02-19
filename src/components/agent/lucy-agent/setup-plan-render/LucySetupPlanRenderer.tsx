/**
 * LucySetupPlanRenderer
 *
 * Custom renderer for the propose_setup_plan tool.
 * Shows the PlanCard with approve/edit/dismiss buttons, or processing state.
 */

import { ToolCall, extractToolResultData } from '@distri/core';
import { ToolCallState } from '@distri/react';
import { tryParseJson } from '@/utils/modelUtils';

// Import extracted components
import { PlanCard } from './PlanCard';
import { SetupPlanAnalyzingMessage } from './SetupPlanAnalyzingMessage';
import { SimpleFallbackRenderer } from './SimpleFallbackRenderer';

// Re-export LucyExecutePlanRenderer from its own file
export { LucyExecutePlanRenderer } from './LucyExecutePlanRenderer';

// Local type definition to avoid circular imports
interface ToolRendererProps {
  toolCall: ToolCall;
  state?: ToolCallState;
}

/**
 * Renderer for propose_setup_plan tool - shows the plan card with actions
 */
export function LucySetupPlanRenderer({ toolCall, state }: ToolRendererProps) {
  const isRunning = state?.status === 'running';
  const isCompleted = state?.status === 'completed';

  // Extract result using distri's extractToolResultData helper
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

  // If running, show loading state
  if (isRunning) {
    return <SetupPlanAnalyzingMessage />;
  }

  // If there's a plan, show PlanCard (reads latest plan from context)
  if (isCompleted && result?.success) {
    return <PlanCard />;
  }

  // Default: show error or fallback
  if (state?.error || (result && !result.success)) {
    return (
      <div className="border border-destructive/30 rounded-lg bg-destructive/10 p-4">
        <div className="text-sm text-destructive">
          {state?.error || result?.error || 'Failed to generate flow'}
        </div>
      </div>
    );
  }

  // Fallback to default renderer
  return <SimpleFallbackRenderer toolCall={toolCall} state={state} />;
}
