/**
 * ExecutionProgressCard
 *
 * Shows real-time progress of setup plan execution.
 * Professional stepper design with status indicators.
 */

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
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

  // Update progress when initialProgress changes (handles race condition)
  useEffect(() => {
    if (initialProgress) {
      setProgress(initialProgress);
      if (initialProgress.is_complete && onComplete) {
        onComplete(initialProgress);
      }
    }
  }, [initialProgress, onComplete]);

  // Subscribe to progress events for real-time updates
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
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Initializing setup...</p>
        </div>
      </div>
    );
  }

  const getStatusIcon = (status: ExecutionStepStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-destructive" />;
      case 'skipped':
        return <AlertCircle className="w-5 h-5 text-amber-500" />;
      default:
        return <Circle className="w-5 h-5 text-muted-foreground/30" />;
    }
  };

  const getStepBgClass = (status: ExecutionStepStatus) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/10 border-green-500/20';
      case 'running':
        return 'bg-primary/10 border-primary/20';
      case 'failed':
        return 'bg-destructive/10 border-destructive/20';
      case 'skipped':
        return 'bg-amber-500/10 border-amber-500/20';
      default:
        return 'bg-muted/30 border-transparent';
    }
  };

  const completedCount = progress.steps.filter(
    (s) => s.status === 'completed'
  ).length;
  const overallProgress = (completedCount / progress.total_steps) * 100;
  const currentStep = progress.steps.find((s) => s.status === 'running');

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          'px-5 py-4 border-b border-border',
          progress.is_complete && !progress.has_error
            ? 'bg-gradient-to-r from-green-500/10 to-transparent'
            : progress.has_error
            ? 'bg-gradient-to-r from-destructive/10 to-transparent'
            : 'bg-gradient-to-r from-primary/10 to-transparent'
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              progress.is_complete && !progress.has_error
                ? 'bg-green-500/20'
                : progress.has_error
                ? 'bg-destructive/20'
                : 'bg-primary/20'
            )}
          >
            {progress.is_complete && !progress.has_error ? (
              <Sparkles className="w-5 h-5 text-green-500" />
            ) : progress.has_error ? (
              <XCircle className="w-5 h-5 text-destructive" />
            ) : (
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold">
              {progress.is_complete && !progress.has_error
                ? 'Setup Complete!'
                : progress.has_error
                ? 'Setup Failed'
                : currentStep
                ? currentStep.name
                : 'Setting up...'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {progress.is_complete && !progress.has_error
                ? 'Your dataset is ready for fine-tuning'
                : progress.has_error
                ? 'An error occurred during setup'
                : `Step ${completedCount + 1} of ${progress.total_steps}`}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {!progress.is_complete && (
          <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                progress.has_error ? 'bg-destructive' : 'bg-primary'
              )}
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="p-4">
        <div className="space-y-2">
          {progress.steps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border transition-all',
                getStepBgClass(step.status),
                step.status === 'pending' && 'opacity-50'
              )}
            >
              {/* Step number or icon */}
              <div className="flex-shrink-0">
                {step.status === 'pending' ? (
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                    {index + 1}
                  </div>
                ) : (
                  getStatusIcon(step.status)
                )}
              </div>

              {/* Step info */}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'text-sm font-medium',
                    step.status === 'completed' && 'text-green-600 dark:text-green-400',
                    step.status === 'failed' && 'text-destructive',
                    step.status === 'running' && 'text-primary'
                  )}
                >
                  {step.name}
                </p>
                {step.message && (
                  <p className="text-xs text-muted-foreground mt-0.5">{step.message}</p>
                )}
                {step.error && (
                  <p className="text-xs text-destructive mt-0.5">{step.error}</p>
                )}
              </div>

              {/* Step progress for running step */}
              {step.status === 'running' && step.progress !== undefined && (
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${step.progress}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Completion footer */}
      {progress.is_complete && !progress.has_error && (
        <div className="px-4 pb-4">
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">
                  Ready for fine-tuning!
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Go to the Jobs tab to start training your model
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-green-500/30 text-green-600 hover:bg-green-500/10"
                onClick={() => {
                  // Find and click the Jobs tab
                  const jobsTab = document.querySelector('[data-section="jobs"]') as HTMLElement;
                  if (jobsTab) jobsTab.click();
                }}
              >
                Go to Jobs
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
