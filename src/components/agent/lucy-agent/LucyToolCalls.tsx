/**
 * LucyToolCalls
 *
 * Renders external tool calls that need user approval.
 * Always uses LucyToolActions for function tools — overrides the default
 * @distri/react DefaultToolActions component set by the chat store.
 */

import { useChatStateStore } from '@distri/react';
import type { DistriAnyTool } from '@distri/react';
import { DistriFnTool } from '@distri/core';
import { LucyToolActions } from './LucyToolActions';

// Type guard to check if tool is a function tool
function isFnTool(tool: DistriAnyTool): tool is DistriFnTool {
  return tool.type === 'function';
}

export function LucyToolCalls({ tools }: { tools?: DistriAnyTool[] }) {
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
        const tool = tools.find((t) => t.name === toolCallState.tool_name);

        // For function tools, ALWAYS use LucyToolActions (override default component)
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

        // For non-function tools with a custom component (e.g., ask_follow_up),
        // render the component set by the store
        if (toolCallState.component) {
          return (
            <div key={`external-tool-${toolCallState.tool_call_id}`}>
              {toolCallState.component}
            </div>
          );
        }

        return null;
      })}
    </>
  );
}

export default LucyToolCalls;
