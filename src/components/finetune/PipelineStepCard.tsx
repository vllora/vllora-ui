/**
 * PipelineStepCard
 *
 * Displays a single pipeline step as a card in the canvas.
 * Shows step status, progress, and allows interaction.
 */

import { cn } from '@/lib/utils';
import type {
  PipelineStep,
  PipelineStepStatus,
} from '@/contexts/FinetuneProcessContext.types';
import {
  Loader2,
  CheckCircle2,
  Circle,
  AlertTriangle,
  XCircle,
  Lock,
  ChevronRight,
} from 'lucide-react';

interface PipelineStepCardProps {
  step: PipelineStep;
  isSelected: boolean;
  onClick: () => void;
}

const STATUS_CONFIG: Record<
  PipelineStepStatus,
  {
    icon: typeof CheckCircle2;
    iconColor: string;
    bgColor: string;
    borderColor: string;
    animate?: boolean;
  }
> = {
  waiting: {
    icon: Lock,
    iconColor: 'text-muted-foreground/50',
    bgColor: 'bg-muted/30',
    borderColor: 'border-border/50',
  },
  ready: {
    icon: Circle,
    iconColor: 'text-blue-500',
    bgColor: 'bg-blue-500/5',
    borderColor: 'border-blue-500/30',
  },
  processing: {
    icon: Loader2,
    iconColor: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/50',
    animate: true,
  },
  complete: {
    icon: CheckCircle2,
    iconColor: 'text-green-500',
    bgColor: 'bg-green-500/5',
    borderColor: 'border-green-500/30',
  },
  attention: {
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    bgColor: 'bg-amber-500/5',
    borderColor: 'border-amber-500/30',
  },
  failed: {
    icon: XCircle,
    iconColor: 'text-red-500',
    bgColor: 'bg-red-500/5',
    borderColor: 'border-red-500/30',
  },
};

export function PipelineStepCard({
  step,
  isSelected,
  onClick,
}: PipelineStepCardProps) {
  const config = STATUS_CONFIG[step.status];
  const Icon = config.icon;
  const isClickable = !step.isBlocked;

  return (
    <button
      onClick={onClick}
      disabled={!isClickable}
      className={cn(
        'w-full text-left rounded-lg border-2 p-4 transition-all',
        config.bgColor,
        config.borderColor,
        isClickable && 'hover:shadow-md cursor-pointer',
        isSelected && 'ring-2 ring-primary ring-offset-2',
        step.isBlocked && 'opacity-60 cursor-not-allowed'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left side: Icon + Content */}
        <div className="flex items-start gap-3">
          {/* Status Icon */}
          <div
            className={cn(
              'p-2 rounded-lg shrink-0',
              step.status === 'processing'
                ? 'bg-blue-500/20'
                : step.status === 'complete'
                ? 'bg-green-500/20'
                : 'bg-muted/50'
            )}
          >
            <Icon
              className={cn(
                'h-5 w-5',
                config.iconColor,
                config.animate && 'animate-spin'
              )}
            />
          </div>

          {/* Content */}
          <div className="min-w-0">
            {/* Category tag */}
            <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              {step.category}
            </span>

            {/* Step name */}
            <h4 className="font-semibold text-foreground mt-0.5">
              {step.name}
            </h4>

            {/* Status text */}
            <p className="text-sm text-muted-foreground mt-1">
              {step.statusText}
            </p>

            {/* Blocked reason */}
            {step.isBlocked && step.blockedReason && (
              <p className="text-xs text-muted-foreground/70 mt-1 italic">
                {step.blockedReason}
              </p>
            )}

            {/* Progress bar */}
            {step.status === 'processing' && step.progress !== undefined && (
              <div className="mt-2 w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${step.progress}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right side: Arrow indicator */}
        {isClickable && (
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        )}
      </div>
    </button>
  );
}

/**
 * Connector line between steps
 */
export function PipelineConnector({ isActive }: { isActive?: boolean }) {
  return (
    <div className="flex justify-center py-1">
      <div
        className={cn(
          'w-0.5 h-6 rounded-full',
          isActive ? 'bg-primary' : 'bg-border'
        )}
      />
    </div>
  );
}
