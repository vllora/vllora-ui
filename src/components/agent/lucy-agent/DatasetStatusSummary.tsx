/**
 * DatasetStatusSummary
 *
 * Compact stat card shown in the LucyWelcome slot when reopening a
 * previously-analyzed dataset. Matches overview panel card style.
 * All data is read from local contexts (zero LLM calls).
 */

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FinetuneWorkflowState } from '@/types/workflow-types';
import type { PlanStatus } from '@/lib/distri-finetune-tools/steps/proposed-plan-store';

// ============================================================================
// Types
// ============================================================================

export interface DatasetStatusSummaryProps {
  recordCount: number;
  workflow: FinetuneWorkflowState | null;
  hasEvalScript: boolean;
  jobCount: number;
  planStatus: PlanStatus | null;
  /** Whether documents are currently being processed/extracted */
  docsProcessing?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function DatasetStatusSummary(props: DatasetStatusSummaryProps) {
  const { recordCount, workflow, hasEvalScript, planStatus, docsProcessing } = props;

  const topicCount = workflow?.topicsConfig?.topicCount;
  const dryRun = workflow?.dryRun;
  const training = workflow?.training;
  const hasEval = hasEvalScript || !!workflow?.graderConfig;

  const trainingDot = training
    ? training.status === 'completed'
      ? 'bg-green-500'
      : training.status === 'running'
        ? 'bg-[rgb(var(--theme-500))] animate-pulse'
        : 'bg-muted-foreground/40'
    : null;

  const trainingLabel = training
    ? training.status === 'completed'
      ? 'Done'
      : training.status === 'running'
        ? 'Running'
        : training.status
    : null;

  const evalPercent = dryRun ? Math.round(dryRun.mean * 100) : null;

  return (
    <div className="space-y-2">
      {docsProcessing ? (
        <p className="text-sm flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[rgb(var(--theme-500))]" />
          Processing your documents...
        </p>
      ) : (
        <p className="text-sm">Welcome back!</p>
      )}

      <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 px-3 py-2.5">
        <div className="flex items-center gap-4 text-[11px]">
          {/* Examples */}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Examples</span>
            <span className="font-semibold tabular-nums">{recordCount.toLocaleString()}</span>
          </div>

          {/* Topics */}
          {topicCount && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Topics</span>
              <span className="font-semibold tabular-nums">{topicCount}</span>
            </div>
          )}

          {/* Eval */}
          {hasEval && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Eval</span>
              {evalPercent !== null ? (
                <span className={cn(
                  'font-semibold tabular-nums',
                  dryRun!.verdict === 'GO' ? 'text-green-500' : dryRun!.verdict === 'WARNING' ? 'text-amber-500' : 'text-destructive'
                )}>
                  {evalPercent}%
                </span>
              ) : (
                <span className="text-muted-foreground/70">ready</span>
              )}
            </div>
          )}

          {/* Training */}
          {training && trainingDot && trainingLabel && (
            <div className="flex items-center gap-1.5">
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', trainingDot)} />
              <span className="font-semibold">{trainingLabel}</span>
            </div>
          )}
        </div>
      </div>

      {docsProcessing ? (
        <p className="text-sm text-muted-foreground">
          I'll create a plan once your documents are ready.
        </p>
      ) : planStatus === 'executing' ? (
        <p className="text-sm text-muted-foreground">
          A plan is currently executing — ask me about the progress.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          What would you like to work on?
        </p>
      )}
    </div>
  );
}
