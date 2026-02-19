/**
 * LucyPlanRenderer
 *
 * Custom renderer for the propose_plan tool.
 * Shows the PlanCard with approve/edit/dismiss buttons, or processing state.
 */

import { ToolCall, extractToolResultData } from '@distri/core';
import { ToolCallState, useChatStateStore } from '@distri/react';
import { tryParseJson } from '@/utils/modelUtils';

// Import extracted components
import { PlanCard } from './PlanCard';
import { PlanAnalyzingMessage } from './PlanAnalyzingMessage';
import { SimpleFallbackRenderer } from './SimpleFallbackRenderer';

// Re-export LucyExecutePlanRenderer from its own file
export { LucyExecutePlanRenderer } from './LucyExecutePlanRenderer';

// Local type definition to avoid circular imports
interface ToolRendererProps {
  toolCall: ToolCall;
  state?: ToolCallState;
}

/**
 * Renderer for propose_plan tool - shows the plan card with actions
 */
export function LucyPlanRenderer({ toolCall, state }: ToolRendererProps) {
  const isRunning = state?.status === 'running';
  const isCompleted = state?.status === 'completed';
  const isProposalTool = toolCall.tool_name === 'propose_plan' || toolCall.tool_name === 'adjust_plan';
  const latestProposalToolCallId = useChatStateStore((chatState) => {
    let latestId: string | null = null;
    let latestTime = -1;

    chatState.toolCalls.forEach((toolState) => {
      const isPlanProposal =
        (toolState.tool_name === 'propose_plan' || toolState.tool_name === 'adjust_plan') &&
        toolState.status === 'completed';

      if (!isPlanProposal) return;

      const timestamp = toolState.endTime ?? toolState.startTime ?? 0;
      if (timestamp >= latestTime) {
        latestTime = timestamp;
        latestId = toolState.tool_call_id;
      }
    });

    return latestId;
  });

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
    return <PlanAnalyzingMessage />;
  }

  // Only the latest completed proposal tool should render the full plan widget.
  if (isCompleted && result?.success && isProposalTool) {
    if (latestProposalToolCallId && toolCall.tool_call_id !== latestProposalToolCallId) {
      return null;
    }
    return <PlanCard />;
  }

  // Default: show error or fallback
  if (state?.error || (result && !result.success)) {
    return (
      <div className="border border-destructive/30 rounded-lg bg-destructive/10 p-4">
        <div className="text-sm text-destructive">
          {state?.error || result?.error || 'Failed to generate plan'}
        </div>
      </div>
    );
  }

  // Fallback to default renderer
  return <SimpleFallbackRenderer toolCall={toolCall} state={state} />;
}
