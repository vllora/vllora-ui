/**
 * LucyToolCalls
 *
 * Renders external tool calls that need user approval.
 * Uses LucyToolActions for Lucy-themed approval UI instead of default.
 */

import { useChatStateStore } from '@distri/react';
import type { DistriAnyTool } from '@distri/react';
import { DistriFnTool } from '@distri/core';
import { LucyToolActions } from './LucyToolActions';

// ============================================================================
// Types
// ============================================================================

interface LucyToolCallsProps {
  tools?: DistriAnyTool[];
}

// Type guard to check if tool is a function tool
function isFnTool(tool: DistriAnyTool): tool is DistriFnTool {
  return tool.type === 'function';
}

// ============================================================================
// Component
// ============================================================================

export function LucyToolCalls({ tools }: LucyToolCallsProps) {
  const toolCalls = useChatStateStore((state) => state.toolCalls);
  const completeTool = useChatStateStore((state) => state.completeTool);

  const externalToolCalls = Array.from(toolCalls.values()).filter(
    (toolCall) =>
      (toolCall.status === 'pending' || toolCall.status === 'running') &&
      toolCall.isExternal
  );

  if (externalToolCalls.length === 0 || !tools) return null;

  return (
    <>
      {externalToolCalls.map((toolCallState) => {
        // Find the matching tool definition
        const tool = tools.find((t) => t.name === toolCallState.tool_name);

        // For UI tools (like ask_follow_up), render their component directly
        // The component is set by the chat store when executeTool is called
        if (toolCallState.component) {
          return (
            <div key={`external-tool-${toolCallState.tool_call_id}`}>
              {toolCallState.component}
            </div>
          );
        }

        // For function tools, render LucyToolActions
        if (tool && isFnTool(tool)) {
          return (
            <div key={`external-tool-${toolCallState.tool_call_id}`}>
              <LucyToolActions
                toolCall={{
                  tool_call_id: toolCallState.tool_call_id,
                  tool_name: toolCallState.tool_name,
                  input: toolCallState.input,
                }}
                toolCallState={toolCallState}
                completeTool={(result) => {
                  completeTool(
                    {
                      tool_call_id: toolCallState.tool_call_id,
                      tool_name: toolCallState.tool_name,
                      input: toolCallState.input,
                    },
                    result
                  );
                }}
                tool={tool}
              />
            </div>
          );
        }

        return null;
      })}
    </>
  );
}

export default LucyToolCalls;
