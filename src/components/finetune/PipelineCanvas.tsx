/**
 * PipelineCanvas
 *
 * Main canvas showing the RFT pipeline as connected step cards.
 * Displays all 7 steps in a vertical flow layout.
 */

import { Fragment } from 'react';
import { PipelineStepCard, PipelineConnector } from './PipelineStepCard';
import { HealthIndicator } from './HealthIndicator';
import type { PipelineState, PipelineStepId } from '@/contexts/FinetuneProcessContext.types';
import type { HealthIndicatorData } from '@/types/validation-types';
import { cn } from '@/lib/utils';

interface PipelineCanvasProps {
  pipelineState: PipelineState;
  selectedStepId: PipelineStepId | null;
  onSelectStep: (stepId: PipelineStepId) => void;
  healthIndicatorData: HealthIndicatorData | null;
  onViewValidationIssues?: () => void;
  className?: string;
}

export function PipelineCanvas({
  pipelineState,
  selectedStepId,
  onSelectStep,
  healthIndicatorData,
  onViewValidationIssues,
  className,
}: PipelineCanvasProps) {
  const { steps, overallProgress } = pipelineState;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h2 className="text-lg font-semibold">RFT Pipeline</h2>
          <p className="text-sm text-muted-foreground">
            {overallProgress.toFixed(0)}% complete
          </p>
        </div>

        {/* Health Indicator */}
        {healthIndicatorData && (
          <HealthIndicator
            data={healthIndicatorData}
            onViewIssues={onViewValidationIssues}
          />
        )}
      </div>

      {/* Overall progress bar */}
      <div className="h-1 bg-muted shrink-0">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${overallProgress}%` }}
        />
      </div>

      {/* Canvas content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg mx-auto space-y-0">
          {steps.map((step, index) => {
            const isLastStep = index === steps.length - 1;
            const nextStep = steps[index + 1];
            const isConnectorActive =
              step.status === 'complete' && nextStep?.status !== 'waiting';

            return (
              <Fragment key={step.id}>
                <PipelineStepCard
                  step={step}
                  isSelected={selectedStepId === step.id}
                  onClick={() => onSelectStep(step.id)}
                />
                {!isLastStep && <PipelineConnector isActive={isConnectorActive} />}
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Footer with legend */}
      <div className="px-6 py-3 border-t border-border shrink-0 bg-muted/30">
        <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Complete
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Ready
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
            Waiting
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact horizontal pipeline view for header
 */
interface PipelineProgressProps {
  pipelineState: PipelineState;
  className?: string;
}

export function PipelineProgress({
  pipelineState,
  className,
}: PipelineProgressProps) {
  const { steps } = pipelineState;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;

        return (
          <Fragment key={step.id}>
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                step.status === 'complete'
                  ? 'bg-green-500'
                  : step.status === 'processing'
                  ? 'bg-blue-500 animate-pulse'
                  : step.status === 'ready'
                  ? 'bg-blue-500/50'
                  : 'bg-muted-foreground/30'
              )}
              title={`${step.name}: ${step.statusText}`}
            />
            {!isLast && (
              <div
                className={cn(
                  'w-3 h-0.5',
                  step.status === 'complete' ? 'bg-green-500' : 'bg-muted'
                )}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
