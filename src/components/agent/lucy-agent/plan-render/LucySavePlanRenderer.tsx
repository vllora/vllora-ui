/**
 * LucySavePlanRenderer
 *
 * Compact renderer for save_plan tool results.
 * Shows plan save status and diff summary without rendering a full PlanCard.
 */

import { ToolCall, extractToolResultData } from '@distri/core';
import { ToolCallState } from '@distri/react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { tryParseJson } from '@/utils/modelUtils';
import { SimpleFallbackRenderer } from './SimpleFallbackRenderer';

interface ToolRendererProps {
  toolCall: ToolCall;
  state?: ToolCallState;
}

export function LucySavePlanRenderer({ toolCall, state }: ToolRendererProps) {
  const isRunning = state?.status === 'running';

  const getResultData = (): any => {
    if (!state?.result) return null;

    const resultData = extractToolResultData(state.result);
    const rawResult = resultData ? resultData.result : state.result;

    if (typeof rawResult === 'string') {
      const parsed = tryParseJson(rawResult);
      return parsed ?? rawResult;
    }

    return rawResult;
  };

  const result = getResultData();

  if (isRunning) {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Saving plan...</span>
        </div>
      </div>
    );
  }

  if (state?.error || (result && !result.success)) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{state?.error || (Array.isArray(result?.errors) && result.errors.length > 0 ? result.errors.join('; ') : null) || result?.error || 'Failed to save plan'}</span>
        </div>
      </div>
    );
  }

  if (result?.success) {
    // Plan is already visible in the workspace with a diff banner — no need to
    // duplicate a "Plan saved" card in the chat.
    return null;
  }

  return <SimpleFallbackRenderer toolCall={toolCall} state={state} />;
}
