/**
 * LucyStepIndicator
 *
 * Shows the status of a step (running, completed, failed, pending).
 */

import { CheckCircle, Clock, AlertCircle } from 'lucide-react';
import type { StepState } from '@distri/react';

// ============================================================================
// Types
// ============================================================================

export interface LucyStepIndicatorProps {
  step: StepState;
}

// ============================================================================
// Component
// ============================================================================

export function LucyStepIndicator({ step }: LucyStepIndicatorProps) {
  const getDuration = () => {
    if (step.startTime) {
      const endTime = step.endTime || Date.now();
      const duration = (endTime - step.startTime) / 1000;
      return duration < 1 ? '< 1s' : `${duration.toFixed(1)}s`;
    }
    return '';
  };

  if (step.status === 'completed') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1 opacity-60">
        <CheckCircle className="h-3 w-3 text-emerald-500" />
        <span className="font-medium">{step.title}</span>
        <span>({getDuration()})</span>
      </div>
    );
  }

  if (step.status === 'running') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-emerald-500" />
        <span className="font-medium animate-pulse">{step.title || 'Lucy is thinking...'}</span>
      </div>
    );
  }

  if (step.status === 'failed') {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive mb-3">
        <AlertCircle className="h-3 w-3" />
        <span className="font-medium">Error occurred</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
      <Clock className="h-3 w-3" />
      <span>Pending</span>
    </div>
  );
}

export default LucyStepIndicator;
