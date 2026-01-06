/**
 * LucyToolRenderer
 *
 * Custom tool renderers for Lucy chat.
 * Provides Lucy-themed UI for tool executions.
 */

import { ToolCall } from '@distri/core';
import { ToolCallState } from '@distri/react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface ToolRendererProps {
  toolCall: ToolCall;
  state?: ToolCallState;
}

export type ToolRendererMap = Record<string, (props: ToolRendererProps) => React.ReactNode>;

// ============================================================================
// Status Badge
// ============================================================================

function ToolStatusBadge({ status }: { status?: string }) {
  switch (status) {
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Running
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" />
          Completed
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
          <XCircle className="h-3 w-3" />
          Error
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Wrench className="h-3 w-3" />
          Pending
        </span>
      );
  }
}

// ============================================================================
// Default Tool Renderer
// ============================================================================

export function LucyDefaultToolRenderer({ toolCall, state }: ToolRendererProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasInput = toolCall.input && Object.keys(toolCall.input).length > 0;
  const hasResult = state?.result;

  return (
    <div className="border border-border rounded-lg bg-muted/30 overflow-hidden">
      {/* Header */}
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
        <ToolStatusBadge status={state?.status} />
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border px-3 py-2 space-y-2">
          {/* Input */}
          {hasInput && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Input</div>
              <pre className="text-xs bg-background p-2 rounded border overflow-x-auto">
                {JSON.stringify(toolCall.input, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
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

          {/* Error */}
          {state?.error && (
            <div>
              <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Error</div>
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
                {state.error}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Specific Tool Renderers
// ============================================================================

/**
 * Renderer for search/query tools
 */
export function LucySearchToolRenderer({ toolCall, state }: ToolRendererProps) {
  const query = toolCall.input?.query || toolCall.input?.search || '';
  const isRunning = state?.status === 'running';

  return (
    <div className="border border-border rounded-lg bg-muted/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <div
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center',
            isRunning ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'
          )}
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          )}
        </div>
        <div>
          <div className="text-sm font-medium">Searching...</div>
          {query && <div className="text-xs text-muted-foreground">"{query}"</div>}
        </div>
      </div>

      {state?.result && (
        <pre className="text-xs bg-background p-2 rounded border overflow-x-auto max-h-32">
          {typeof state.result === 'string'
            ? state.result
            : JSON.stringify(state.result, null, 2)}
        </pre>
      )}
    </div>
  );
}

/**
 * Renderer for code execution tools
 */
export function LucyCodeToolRenderer({ toolCall, state }: ToolRendererProps) {
  const code = toolCall.input?.code || toolCall.input?.script || '';
  const language = toolCall.input?.language || 'javascript';

  return (
    <div className="border border-border rounded-lg bg-muted/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono">{toolCall.tool_name}</code>
          <span className="text-xs text-muted-foreground">({language})</span>
        </div>
        <ToolStatusBadge status={state?.status} />
      </div>

      {code && (
        <pre className="text-xs p-3 overflow-x-auto bg-zinc-900 text-zinc-100">
          <code>{code}</code>
        </pre>
      )}

      {state?.result && (
        <div className="border-t border-border p-3">
          <div className="text-xs font-medium text-muted-foreground mb-1">Output</div>
          <pre className="text-xs bg-background p-2 rounded border overflow-x-auto">
            {typeof state.result === 'string'
              ? state.result
              : JSON.stringify(state.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tool Renderer Map
// ============================================================================

/**
 * Default Lucy tool renderers map.
 * Maps tool names to their custom renderers.
 */
export const lucyToolRenderers: ToolRendererMap = {
  // Add specific tool renderers here
  // 'search': LucySearchToolRenderer,
  // 'execute_code': LucyCodeToolRenderer,
};

/**
 * Creates a tool renderer map with Lucy defaults and custom overrides.
 */
export function createLucyToolRenderers(
  overrides?: ToolRendererMap
): ToolRendererMap {
  return {
    ...lucyToolRenderers,
    ...overrides,
  };
}

export default LucyDefaultToolRenderer;
