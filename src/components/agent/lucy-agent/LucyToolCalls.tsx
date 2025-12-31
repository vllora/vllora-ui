/**
 * LucyToolCalls
 *
 * Renders external tool calls that need user approval.
 * Displays the tool component for pending/running external tools.
 */

import { useChatStateStore } from '@distri/react';

// ============================================================================
// Component
// ============================================================================

export function LucyToolCalls() {
  const toolCalls = useChatStateStore((state) => state.toolCalls);

  const externalToolCalls = Array.from(toolCalls.values()).filter(
    (toolCall) =>
      (toolCall.status === 'pending' || toolCall.status === 'running') &&
      toolCall.isExternal &&
      toolCall.component
  );

  if (externalToolCalls.length === 0) return null;

  return (
    <>
      {externalToolCalls.map((toolCall) => (
        <div key={`external-tool-${toolCall.tool_call_id}`}>{toolCall.component}</div>
      ))}
    </>
  );
}

export default LucyToolCalls;
