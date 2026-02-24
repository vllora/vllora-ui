/**
 * LucyToolCallCard
 *
 * Displays a tool call with its status, input, and output.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle, XCircle, Clock } from 'lucide-react';
import { extractToolResultData } from '@distri/core';
import type { ToolCallState } from '@distri/react';
import { JsonViewer } from '@/components/chat/traces/TraceRow/span-info/JsonViewer';
import { tryParseJson } from '@/utils/modelUtils';
import { getFriendlyToolMessage } from './lucy-message-utils';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface LucyToolCallCardProps {
  toolCall: { tool_call_id: string; tool_name: string; input: any };
  state?: ToolCallState;
}

// ============================================================================
// Component
// ============================================================================

export function LucyToolCallCard({ toolCall, state }: LucyToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'output'>('output');

  const friendlyMessage = getFriendlyToolMessage(toolCall.tool_name, toolCall.input);
  const executionTime =
    state?.endTime && state?.startTime ? state.endTime - state.startTime : undefined;

  const getResultData = () => {
    if (!state?.result) return null;

    const resultData = extractToolResultData(state.result);
    const result = resultData ? resultData.result : state.result;

    // If result is a string, try to parse it as JSON
    if (typeof result === 'string') {
      return tryParseJson(result) ?? result;
    }

    return result;
  };

  // Pending/Running state
  if (state?.status === 'pending' || state?.status === 'running') {
    return (
      <div className="my-1 border-l-2 border-[rgb(var(--theme-500))] pl-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-[rgb(var(--theme-500))] border-t-transparent shrink-0" />
          <span className="text-xs font-mono text-[rgb(var(--theme-400))]">
            {toolCall.tool_name}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 animate-pulse">{friendlyMessage}</p>
      </div>
    );
  }

  // Completed state
  if (state?.status === 'completed') {
    return (
      <div className="my-1 border-l border-border/40 pl-3 overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full py-1 flex items-center gap-2 hover:bg-muted/30 transition-colors -ml-3 pl-3 pr-1"
        >
          <CheckCircle className="w-3 h-3 text-[rgb(var(--theme-500))] shrink-0" />
          <span className="text-xs font-mono text-muted-foreground">
            {toolCall.tool_name}
          </span>
          {!!executionTime && executionTime >= 500 && (
            <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {executionTime >= 1000
                ? `${(executionTime / 1000).toFixed(1)}s`
                : `${executionTime}ms`}
            </span>
          )}
          <div className="ml-auto flex items-center text-xs text-muted-foreground">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </div>
        </button>

        {/* Expandable Content */}
        {isExpanded && (
          <div className="border-t border-border/30 pt-2 pb-1 mt-1">
            <div className="mb-2 flex items-center gap-1.5">
              {(['output', 'input'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-md font-medium transition-colors',
                    activeTab === tab
                      ? 'bg-[rgb(var(--theme-600))] text-white'
                      : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                  )}
                >
                  {tab === 'output' ? 'Output' : 'Input'}
                </button>
              ))}
            </div>
            <div className="rounded-md border border-border/50 bg-muted/50 p-2 max-h-64 overflow-auto">
              <JsonViewer
                data={activeTab === 'input' ? toolCall.input : getResultData()}
                collapsed={5}
                collapseStringsAfterLength={500}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Error state
  if (state?.status === 'error') {
    return (
      <div className="my-1 border-l-2 border-destructive pl-3 py-1.5">
        <div className="flex items-center gap-2">
          <XCircle className="w-4 h-4 text-destructive shrink-0" />
          <span className="text-xs font-mono text-destructive">
            {toolCall.tool_name}
          </span>
        </div>
        <p className="text-xs text-destructive mt-0.5">
          {friendlyMessage.replace('...', '')} failed
        </p>
        {state.error && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{state.error}</p>
        )}
      </div>
    );
  }

  return null;
}

export default LucyToolCallCard;
