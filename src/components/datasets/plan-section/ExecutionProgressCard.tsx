/**
 * ExecutionProgressCard
 *
 * Compact execution progress display with inline stepper.
 * Minimalist design that harmonizes with other plan section components.
 */

import { useEffect, useState } from 'react';
import {
  Check,
  Loader2,
  XCircle,
  AlertCircle,
  Sparkles,
  Circle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { emitter } from '@/utils/eventEmitter';
import { DatasetDetailConsumer } from '@/contexts/DatasetDetailContext';
import type {
  ExecutionProgress,
  ExecutionStepStatus,
} from '@/lib/distri-finetune-tools/steps/execute-plan';

interface ExecutionProgressCardProps {
  initialProgress?: ExecutionProgress;
  onComplete?: (progress: ExecutionProgress) => void;
}

export function ExecutionProgressCard({
  initialProgress,
  onComplete,
}: ExecutionProgressCardProps) {
  const { setActiveSection } = DatasetDetailConsumer();
  const [progress, setProgress] = useState<ExecutionProgress | null>(
    initialProgress || null
  );

  useEffect(() => {
    if (initialProgress) {
      setProgress(initialProgress);
      if (initialProgress.is_complete && onComplete) {
        onComplete(initialProgress);
      }
    }
  }, [initialProgress, onComplete]);

  useEffect(() => {
    const handleProgress = ({ progress: newProgress }: { progress: ExecutionProgress }) => {
      setProgress(newProgress);
      if (newProgress.is_complete && onComplete) {
        onComplete(newProgress);
      }
    };

    emitter.on('vllora_plan_progress' as any, handleProgress);
    return () => {
      emitter.off('vllora_plan_progress' as any, handleProgress);
    };
  }, [onComplete]);

  if (!progress) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
          <span className="text-sm text-muted-foreground">Initializing setup...</span>
        </div>
      </div>
    );
  }

  const getStepIndicator = (status: ExecutionStepStatus) => {
    switch (status) {
      case 'completed':
        return (
          <div className="w-5 h-5 rounded-full bg-[rgb(var(--theme-500))] flex items-center justify-center">
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </div>
        );
      case 'running':
        return (
          <div className="w-5 h-5 rounded-full border-2 border-[rgb(var(--theme-500))] flex items-center justify-center">
            <Loader2 className="w-3 h-3 text-[rgb(var(--theme-500))] animate-spin" />
          </div>
        );
      case 'failed':
        return (
          <div className="w-5 h-5 rounded-full bg-destructive flex items-center justify-center">
            <XCircle className="w-3 h-3 text-white" />
          </div>
        );
      case 'skipped':
        return (
          <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center">
            <AlertCircle className="w-3 h-3 text-amber-500" />
          </div>
        );
      default:
        return (
          <div className="w-5 h-5 rounded-full border border-border flex items-center justify-center">
            <Circle className="w-2 h-2 text-muted-foreground/40" fill="currentColor" />
          </div>
        );
    }
  };

  // Filter out skipped steps — only show steps that are actually in this execution
  const activeSteps = progress.steps.filter((s) => s.status !== 'skipped');
  const completedCount = activeSteps.filter((s) => s.status === 'completed').length;
  const totalActive = activeSteps.length;
  const overallProgress = totalActive > 0 ? (completedCount / totalActive) * 100 : 0;
  const currentStep = activeSteps.find((s) => s.status === 'running');
  const failedStep = activeSteps.find((s) => s.status === 'failed');

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          {progress.is_complete && !progress.has_error ? (
            <Sparkles className="w-4 h-4 text-[rgb(var(--theme-500))]" />
          ) : progress.has_error ? (
            <XCircle className="w-4 h-4 text-destructive" />
          ) : (
            <Loader2 className="w-4 h-4 text-[rgb(var(--theme-500))] animate-spin" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">
                {progress.is_complete && !progress.has_error
                  ? 'Setup Complete'
                  : progress.has_error
                  ? 'Setup Failed'
                  : currentStep?.name || 'Setting up...'}
              </span>
              {!progress.is_complete && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {completedCount}/{totalActive}
                </span>
              )}
            </div>
            {currentStep?.message && !progress.is_complete && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {currentStep.message}
              </p>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {!progress.is_complete && (
          <div className="mt-2.5 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                progress.has_error ? 'bg-destructive' : 'bg-[rgb(var(--theme-500))]'
              )}
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* Step List */}
      <div className="px-4 py-3">
        <div className="space-y-0">
          {activeSteps.map((step, index) => (
            <div key={step.id} className="flex gap-3">
              {/* Indicator + connector */}
              <div className="flex flex-col items-center">
                {getStepIndicator(step.status)}
                {index < activeSteps.length - 1 && (
                  <div
                    className={cn(
                      'w-px flex-1 min-h-[12px]',
                      step.status === 'completed' ? 'bg-border' : 'bg-border/40'
                    )}
                  />
                )}
              </div>
              {/* Label */}
              <div className={cn('flex-1 min-w-0 pb-2.5', step.status === 'pending' && 'opacity-40')}>
                <span
                  className={cn(
                    'text-xs',
                    step.status === 'completed' && 'text-foreground/70',
                    step.status === 'failed' && 'text-destructive',
                    step.status === 'running' && 'text-foreground font-medium',
                    step.status === 'pending' && 'text-muted-foreground',
                    step.status === 'skipped' && 'text-amber-500'
                  )}
                >
                  {step.name}
                </span>
                {step.status === 'running' && step.message && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{step.message}</p>
                )}
                {step.error && (
                  <p className="text-[11px] text-destructive mt-0.5">{step.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Completion Footer */}
      {progress.is_complete && !progress.has_error && (
        <div className="px-4 pb-4">
          <div className="flex flex-col items-center gap-3 px-4 py-4 rounded-lg bg-[rgba(var(--theme-500),0.08)] border border-[rgba(var(--theme-500),0.2)]">
            <div className="w-8 h-8 rounded-full bg-[rgb(var(--theme-500))] flex items-center justify-center">
              <Check className="w-4 h-4 text-white" strokeWidth={3} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Setup Complete</p>
              <p className="text-xs text-muted-foreground mt-0.5">Your experiment is ready for training</p>
            </div>
            <div className="flex items-center gap-2 w-full">
              <Button
                size="sm"
                className="flex-1 gap-1.5 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
                onClick={() => setActiveSection('jobs')}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Start Fine-tuning
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setActiveSection('records')}
              >
                Review Data
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Error Footer */}
      {progress.has_error && failedStep && (
        <div className="px-4 pb-3">
          <div className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20">
            <p className="text-xs text-destructive font-medium">
              Failed at: {failedStep.name}
            </p>
            {failedStep.error && (
              <p className="text-xs text-destructive/80 mt-0.5">{failedStep.error}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
