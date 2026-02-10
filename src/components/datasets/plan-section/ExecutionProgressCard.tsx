/**
 * ExecutionProgressCard
 *
 * Compact execution progress display with inline stepper.
 * Minimalist design that harmonizes with other plan section components.
 */

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  XCircle,
  AlertCircle,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { emitter } from '@/utils/eventEmitter';
import type {
  ExecutionProgress,
  ExecutionStepStatus,
} from '@/lib/distri-finetune-tools/steps/execute-setup-plan';

interface ExecutionProgressCardProps {
  initialProgress?: ExecutionProgress;
  onComplete?: (progress: ExecutionProgress) => void;
}

export function ExecutionProgressCard({
  initialProgress,
  onComplete,
}: ExecutionProgressCardProps) {
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

    emitter.on('vllora_setup_plan_progress' as any, handleProgress);
    return () => {
      emitter.off('vllora_setup_plan_progress' as any, handleProgress);
    };
  }, [onComplete]);

  if (!progress) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
          <span className="text-sm text-muted-foreground">Initializing setup...</span>
        </div>
      </div>
    );
  }

  const getStepIndicator = (status: ExecutionStepStatus, index: number) => {
    const baseClasses = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all';
    switch (status) {
      case 'completed':
        return (
          <div className={cn(baseClasses, 'bg-[rgb(var(--theme-500))] text-white')}>
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
        );
      case 'running':
        return (
          <div className={cn(baseClasses, 'bg-[rgba(var(--theme-500),0.7)] text-white')}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          </div>
        );
      case 'failed':
        return (
          <div className={cn(baseClasses, 'bg-destructive text-destructive-foreground')}>
            <XCircle className="w-3.5 h-3.5" />
          </div>
        );
      case 'skipped':
        return (
          <div className={cn(baseClasses, 'bg-amber-500 text-white')}>
            <AlertCircle className="w-3.5 h-3.5" />
          </div>
        );
      default:
        return (
          <div className={cn(baseClasses, 'bg-muted text-muted-foreground')}>
            {index + 1}
          </div>
        );
    }
  };

  const completedCount = progress.steps.filter((s) => s.status === 'completed').length;
  const overallProgress = (completedCount / progress.total_steps) * 100;
  const currentStep = progress.steps.find((s) => s.status === 'running');
  const failedStep = progress.steps.find((s) => s.status === 'failed');

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Compact Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          {progress.is_complete && !progress.has_error ? (
            <div className="w-8 h-8 rounded-full bg-[rgba(var(--theme-500),0.15)] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[rgb(var(--theme-500))]" />
            </div>
          ) : progress.has_error ? (
            <div className="w-8 h-8 rounded-full bg-destructive/15 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-destructive" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-[rgba(var(--theme-500),0.15)] flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-[rgb(var(--theme-500))] animate-spin" />
            </div>
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
                  {completedCount}/{progress.total_steps}
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

        {/* Inline Progress Bar */}
        {!progress.is_complete && (
          <div className="mt-2.5 h-1.5 bg-muted rounded-full overflow-hidden">
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

      {/* Vertical Step Indicators */}
      <div className="px-4 py-3">
        <div className="space-y-0">
          {progress.steps.map((step, index) => (
            <div key={step.id} className="flex gap-3">
              {/* Indicator column */}
              <div className="flex flex-col items-center">
                {getStepIndicator(step.status, index)}
                {index < progress.steps.length - 1 && (
                  <div
                    className={cn(
                      'w-0.5 flex-1 min-h-[16px]',
                      step.status === 'completed' ? 'bg-[rgb(var(--theme-500))]' : 'bg-muted'
                    )}
                  />
                )}
              </div>
              {/* Content column */}
              <div className={cn('flex-1 min-w-0 pb-3', step.status === 'pending' && 'opacity-50')}>
                <span
                  className={cn(
                    'text-xs',
                    step.status === 'completed' && 'text-[rgb(var(--theme-600))]',
                    step.status === 'failed' && 'text-destructive',
                    step.status === 'running' && 'text-[rgb(var(--theme-500))] font-medium',
                    step.status === 'pending' && 'text-muted-foreground'
                  )}
                >
                  {step.name}
                </span>
                {step.status === 'running' && step.message && (
                  <p className="text-xs text-muted-foreground mt-0.5">{step.message}</p>
                )}
                {step.error && (
                  <p className="text-xs text-destructive mt-0.5">{step.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Compact Completion Footer */}
      {progress.is_complete && !progress.has_error && (
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-[rgba(var(--theme-500),0.1)] border border-[rgba(var(--theme-500),0.2)]">
            <span className="text-xs text-[rgb(var(--theme-600))]">
              Ready for fine-tuning
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-[rgb(var(--theme-600))] hover:text-[rgb(var(--theme-700))] hover:bg-[rgba(var(--theme-500),0.1)]"
              onClick={() => {
                const jobsTab = document.querySelector('[data-section="jobs"]') as HTMLElement;
                if (jobsTab) jobsTab.click();
              }}
            >
              Go to Jobs
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
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
