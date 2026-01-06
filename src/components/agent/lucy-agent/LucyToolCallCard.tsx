/**
 * LucyToolCallCard
 *
 * Displays a tool call with its status, input, and output.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle, XCircle, Wrench, Clock } from 'lucide-react';
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
      <div className="my-2 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/10">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-emerald-500 border-t-transparent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                {toolCall.tool_name}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 animate-pulse">{friendlyMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  // Completed state
  if (state?.status === 'completed') {
    return (
      <div className="my-2 rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/10">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-700/50 text-zinc-300">
                <Wrench className="w-3 h-3 inline-block mr-1" />
                {toolCall.tool_name}
              </span>
              {!!executionTime && executionTime >= 500 && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {executionTime >= 1000
                    ? `${(executionTime / 1000).toFixed(1)}s`
                    : `${executionTime}ms`}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
        </button>

        {/* Expandable Content */}
        {isExpanded && (
          <div className="border-t border-border/50 p-3 bg-muted/20">
            <div className="mb-3 flex items-center gap-2">
              {(['output', 'input'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-md font-medium transition-colors',
                    activeTab === tab
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                  )}
                >
                  {tab === 'output' ? 'Output' : 'Input'}
                </button>
              ))}
            </div>
            <div className="rounded-md border border-border/50 bg-zinc-900/50 p-2 max-h-64 overflow-auto">
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
      <div className="my-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-destructive/10">
            <XCircle className="w-4 h-4 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/20 text-destructive">
                {toolCall.tool_name}
              </span>
            </div>
            <p className="text-sm text-destructive mt-1">
              {friendlyMessage.replace('...', '')} failed
            </p>
            {state.error && (
              <p className="text-xs text-muted-foreground mt-1 truncate">{state.error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default LucyToolCallCard;
