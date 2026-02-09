/**
 * ExecutionProgressCard
 *
 * Shows real-time progress of setup plan execution.
 * Displays each step with status indicators and progress bars.
 */

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  AlertCircle,
  PartyPopper,
} from 'lucide-react';
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
  // This ensures we capture the final state if events fired before subscription
  useEffect(() => {
    if (initialProgress) {
      setProgress(initialProgress);
      // If initial progress is already complete, trigger onComplete
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
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Initializing...</span>
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

  const completedCount = progress.steps.filter(
    (s) => s.status === 'completed'
  ).length;
  const overallProgress = (completedCount / progress.total_steps) * 100;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          'px-4 py-3 border-b border-border',
          progress.is_complete && !progress.has_error
            ? 'bg-green-500/10'
            : progress.has_error
            ? 'bg-destructive/10'
            : 'bg-primary/10'
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {progress.is_complete && !progress.has_error ? (
              <PartyPopper className="w-5 h-5 text-green-500" />
            ) : progress.has_error ? (
              <XCircle className="w-5 h-5 text-destructive" />
            ) : (
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            )}
            <span className="text-sm font-medium">
              {progress.is_complete && !progress.has_error
                ? 'Setup Complete!'
                : progress.has_error
                ? 'Setup Failed'
                : 'Setting up your dataset...'}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {completedCount}/{progress.total_steps} steps
          </span>
        </div>

        {/* Overall progress bar */}
        {!progress.is_complete && (
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="p-4 space-y-3">
        {progress.steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              'flex items-start gap-3',
              step.status === 'pending' && 'opacity-50'
            )}
          >
            {/* Status icon */}
            <div className="flex-shrink-0 mt-0.5">
              {getStatusIcon(step.status)}
            </div>

            {/* Step info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-sm font-medium',
                    step.status === 'completed' && 'text-green-500',
                    step.status === 'failed' && 'text-destructive'
                  )}
                >
                  {step.name}
                </span>
              </div>
              {step.message && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {step.message}
                </div>
              )}
              {step.error && (
                <div className="text-xs text-destructive mt-0.5">
                  {step.error}
                </div>
              )}
              {step.status === 'running' && step.progress !== undefined && (
                <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${step.progress}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Completion message */}
      {progress.is_complete && !progress.has_error && (
        <div className="px-4 py-3 bg-green-500/10 border-t border-border">
          <div className="text-sm text-green-600 dark:text-green-400">
            Your dataset is now ready for fine-tuning! Go to the <strong>Jobs</strong> tab to start training.
          </div>
        </div>
      )}
    </div>
  );
}
