/**
 * LucyToolExecutionRenderer
 *
 * Renders tool execution events with custom renderers support.
 */

import { DistriEvent } from '@distri/core';
import { useChatStateStore } from '@distri/react';
import { LucyToolCallCard } from './LucyToolCallCard';
import type { ToolRendererMap } from './LucyToolRenderer';

// ============================================================================
// Types
// ============================================================================

export interface LucyToolExecutionRendererProps {
  event: DistriEvent;
  toolRenderers?: ToolRendererMap;
}

// ============================================================================
// Component
// ============================================================================

export function LucyToolExecutionRenderer({ event, toolRenderers }: LucyToolExecutionRendererProps) {
  const toolCallStates = useChatStateStore((state) => state.toolCalls);
  const eventData = event.data as
    | { tool_calls?: Array<{ tool_call_id: string; tool_name: string; input: any }> }
    | undefined;
  const toolCalls = eventData?.tool_calls || [];

  if (toolCalls.length === 0) return null;

  return (
    <div className="ml-8">
      {toolCalls
        .filter((tc: any) => tc.tool_name !== 'final')
        .map((toolCall: any) => {
          const state = toolCallStates.get(toolCall.tool_call_id);

          // Use custom renderer if provided
          const customRenderer = toolRenderers?.[toolCall.tool_name];
          if (customRenderer) {
            return (
              <div key={toolCall.tool_call_id}>
                {customRenderer({
                  toolCall: {
                    tool_call_id: toolCall.tool_call_id,
                    tool_name: toolCall.tool_name,
                    input: toolCall.input,
                  },
                  state,
                })}
              </div>
            );
          }

          return <LucyToolCallCard key={toolCall.tool_call_id} toolCall={toolCall} state={state} />;
        })}
    </div>
  );
}

export default LucyToolExecutionRenderer;
