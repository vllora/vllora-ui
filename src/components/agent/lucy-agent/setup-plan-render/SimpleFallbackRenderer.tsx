/**
 * SimpleFallbackRenderer
 *
 * Simple fallback renderer for tool calls that don't have a custom renderer.
 * Shows expandable input/output details.
 */

import { ToolCall } from '@distri/core';
import { ToolCallState } from '@distri/react';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { useState } from 'react';

// Local type definition to avoid circular imports
interface ToolRendererProps {
  toolCall: ToolCall;
  state?: ToolCallState;
}

export function SimpleFallbackRenderer({ toolCall, state }: ToolRendererProps) {
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
