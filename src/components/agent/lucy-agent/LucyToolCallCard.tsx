/**
 * LucyToolCallCard
 *
 * Displays a tool call with its status, input, and output.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import { extractToolResultData } from '@distri/core';
import type { ToolCallState } from '@distri/react';
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

  const renderResultData = () => {
    if (!state?.result) return 'No result available';

    const resultData = extractToolResultData(state.result);
    if (resultData) {
      if (typeof resultData.result === 'object') {
        return JSON.stringify(resultData.result, null, 2);
      }
      return String(resultData.result);
    }
    return JSON.stringify(state.result, null, 2);
  };

  // Pending/Running state
  if (state?.status === 'pending' || state?.status === 'running') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-500" />
        <span className="animate-pulse">{friendlyMessage}</span>
      </div>
    );
  }

  // Completed state
  if (state?.status === 'completed') {
    return (
      <div className="py-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span>
              {friendlyMessage.replace('...', '')} completed
              {executionTime && executionTime > 100 && (
                <span className="ml-1 text-xs">({(executionTime / 1000).toFixed(1)}s)</span>
              )}
            </span>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Details
          </button>
        </div>

        {isExpanded && (
          <div className="mt-2">
            <div className="mb-2 flex items-center gap-2">
              {(['output', 'input'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'text-xs px-2 py-1 rounded border transition-colors',
                    activeTab === tab
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab === 'output' ? 'Output' : 'Input'}
                </button>
              ))}
            </div>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-auto break-words border rounded-md p-3 bg-muted/50 max-h-48">
              {activeTab === 'input' ? JSON.stringify(toolCall.input, null, 2) : renderResultData()}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // Error state
  if (state?.status === 'error') {
    return (
      <div className="py-2">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <XCircle className="h-4 w-4" />
          <span>
            {friendlyMessage.replace('...', '')} failed
            {state.error && <span className="ml-1 text-xs">- {state.error}</span>}
          </span>
        </div>
      </div>
    );
  }

  return null;
}

export default LucyToolCallCard;
