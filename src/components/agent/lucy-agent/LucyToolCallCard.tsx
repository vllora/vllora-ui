/**
 * LucyToolCallCard
 *
 * Displays a tool call with its status, input, and output.
 * Includes progress tracking for data generation and client-side timeout detection.
 */

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { extractToolResultData } from '@distri/core';
import type { ToolCallState } from '@distri/react';
import { JsonViewer } from '@/components/chat/traces/TraceRow/span-info/JsonViewer';
import { tryParseJson } from '@/utils/modelUtils';
import { getFriendlyToolMessage } from './lucy-message-utils';
import { cn } from '@/lib/utils';
import { emitter } from '@/utils/eventEmitter';

// ============================================================================
// Constants
// ============================================================================

/** Client-side timeout matches Distri server's external tool timeout (600s) */
const TOOL_TIMEOUT_MS = 600_000;

/** Tools that emit progress events */
const PROGRESS_TOOLS = new Set([
  'generate_initial_data',
  'generate_synthetic_data',
]);

// ============================================================================
// Helpers
// ============================================================================

/** Convert snake_case tool name to Title Case display name */
function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format elapsed ms into a human-readable string */
function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

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

  // Live elapsed time for running tools
  const [liveElapsed, setLiveElapsed] = useState(0);

  // Progress state for data generation tools
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);

  const isRunning = state?.status === 'pending' || state?.status === 'running';
  const isProgressTool = PROGRESS_TOOLS.has(toolCall.tool_name);

  // Live elapsed timer — ticks every second while running
  useEffect(() => {
    if (!isRunning || !state?.startTime) return;
    const update = () => setLiveElapsed(Date.now() - state.startTime!);
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [isRunning, state?.startTime]);

  // Listen for data generation progress events
  const progressRef = useRef(progress);
  progressRef.current = progress;
  useEffect(() => {
    if (!isRunning || !isProgressTool) return;

    const handleProgress = (event: {
      status: string;
      completed?: number;
      total?: number;
    }) => {
      if (event.status === 'progress' || event.status === 'started') {
        if (event.completed !== undefined && event.total !== undefined) {
          setProgress({ completed: event.completed, total: event.total });
        }
      } else if (event.status === 'completed' || event.status === 'failed') {
        setProgress(null);
      }
    };

    emitter.on('vllora_data_generation_progress', handleProgress);
    return () => {
      emitter.off('vllora_data_generation_progress', handleProgress);
      setProgress(null);
    };
  }, [isRunning, isProgressTool]);

  const friendlyMessage = getFriendlyToolMessage(toolCall.tool_name, toolCall.input);
  const completedElapsed =
    state?.endTime && state?.startTime ? state.endTime - state.startTime : undefined;

  // Client-side timeout detection (Fix #009)
  const isTimedOut = isRunning && state?.startTime && liveElapsed > TOOL_TIMEOUT_MS;

  const getResultData = () => {
    if (!state?.result) return null;
    const resultData = extractToolResultData(state.result);
    const result = resultData ? resultData.result : state.result;
    if (typeof result === 'string') {
      return tryParseJson(result) ?? result;
    }
    return result;
  };

  // ── Timed out state (Fix #009) ──
  if (isTimedOut) {
    return (
      <div className="my-1 border-l-2 border-amber-500 pl-3 py-1.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-xs font-medium text-amber-400">
            {formatToolName(toolCall.tool_name)}
          </span>
          <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatElapsed(liveElapsed)}
          </span>
        </div>
        <p className="text-xs text-amber-400/80 mt-0.5">
          Timed out — the server stopped responding after 10 minutes
        </p>
      </div>
    );
  }

  // ── Pending / Running state ──
  if (isRunning) {
    return (
      <div className="my-1 py-1">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-3 w-3 border-[1.5px] border-[rgb(var(--theme-500))] border-t-transparent shrink-0" />
          <span className="text-xs font-medium text-muted-foreground">
            {formatToolName(toolCall.tool_name)}
          </span>
          {state?.startTime && liveElapsed >= 1000 && (
            <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatElapsed(liveElapsed)}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground/50 mt-0.5">{friendlyMessage}</p>
        {/* Progress counter for data generation (Fix #003) */}
        {progress && progress.total > 0 && (
          <div className="mt-1 flex items-center gap-2">
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-[rgb(var(--theme-500))] rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (progress.completed / progress.total) * 100)}%` }}
              />
            </div>
            <span className="text-[11px] text-muted-foreground/60 tabular-nums shrink-0">
              {progress.completed}/{progress.total}
            </span>
          </div>
        )}
      </div>
    );
  }

  // ── Completed state ──
  if (state?.status === 'completed') {
    return (
      <div className="my-1 overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="group/tool w-full py-1 flex items-center gap-2 hover:bg-muted/30 transition-colors -ml-3 pl-3 pr-1 rounded"
        >
          <CheckCircle className="w-3 h-3 text-[rgb(var(--theme-500))] shrink-0" />
          <span className="text-xs font-medium text-muted-foreground">
            {formatToolName(toolCall.tool_name)}
          </span>
          {!!completedElapsed && completedElapsed >= 500 && (
            <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatElapsed(completedElapsed)}
            </span>
          )}
          <div className={cn(
            'ml-auto flex items-center text-xs transition-colors',
            isExpanded ? 'text-muted-foreground' : 'text-muted-foreground/0 group-hover/tool:text-muted-foreground/50'
          )}>
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </div>
        </button>

        {/* Expandable Content */}
        {isExpanded && (
          <div className="pt-1.5 pb-1">
            <div className="mb-1.5 flex items-center gap-3 border-b border-border/30 px-1">
              {(['output', 'input'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'text-[11px] pb-1.5 transition-colors border-b-2 -mb-px',
                    activeTab === tab
                      ? 'border-foreground/60 text-foreground/80 font-medium'
                      : 'border-transparent text-muted-foreground/60 hover:text-muted-foreground'
                  )}
                >
                  {tab === 'output' ? 'Output' : 'Input'}
                </button>
              ))}
            </div>
            <div className="rounded border border-border/30 bg-muted/20 p-2 max-h-64 overflow-auto text-[12px]">
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

  // ── Error state ──
  if (state?.status === 'error') {
    return (
      <div className="my-1 border-l-2 border-destructive pl-3 py-1.5">
        <div className="flex items-center gap-2">
          <XCircle className="w-4 h-4 text-destructive shrink-0" />
          <span className="text-xs font-medium text-destructive">
            {formatToolName(toolCall.tool_name)}
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
