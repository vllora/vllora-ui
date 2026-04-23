/**
 * Health Indicator Component
 *
 * Shows dataset health status (valid/invalid record counts)
 * in the pipeline header. Runs automatically when data changes.
 */

import { cn } from '@/lib/utils';
import {
  HealthStatus,
  HealthIndicatorData,
  ValidationError,
  VALIDATION_ERROR_MESSAGES,
} from '@/types/validation-types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';

interface HealthIndicatorProps {
  data: HealthIndicatorData;
  onViewIssues?: () => void;
  className?: string;
}

const STATUS_CONFIG: Record<
  HealthStatus,
  { icon: typeof CheckCircle2; color: string; bgColor: string; label: string }
> = {
  healthy: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    label: 'Healthy',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    label: 'Warning',
  },
  critical: {
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    label: 'Critical',
  },
  validating: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    label: 'Validating',
  },
};

function formatCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toLocaleString();
}

export function HealthIndicator({
  data,
  onViewIssues,
  className,
}: HealthIndicatorProps) {
  const config = STATUS_CONFIG[data.status];
  const Icon = config.icon;
  const rejectionRatePercent = (data.rejectionRate * 100).toFixed(1);

  return (
    <TooltipProvider>
      <div
        className={cn(
          'flex items-center gap-3 px-3 py-1.5 rounded-md border',
          config.bgColor,
          'border-border/50',
          className
        )}
      >
        {/* Status Icon */}
        <Icon
          className={cn(
            'h-4 w-4',
            config.color,
            data.status === 'validating' && 'animate-spin'
          )}
        />

        {/* Valid count */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 text-sm">
              <span className="text-green-600 dark:text-green-400 font-medium">
                {formatCount(data.validCount)}
              </span>
              <span className="text-muted-foreground">valid</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Records ready for training</p>
          </TooltipContent>
        </Tooltip>

        {/* Separator */}
        {data.invalidCount > 0 && (
          <span className="text-border">|</span>
        )}

        {/* Invalid count (if any) */}
        {data.invalidCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onViewIssues}
                className="flex items-center gap-1 text-sm hover:underline cursor-pointer"
              >
                <span className="text-orange-600 dark:text-orange-400 font-medium">
                  {formatCount(data.invalidCount)}
                </span>
                <span className="text-muted-foreground">
                  invalid ({rejectionRatePercent}%)
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <div className="space-y-1">
                <p className="font-medium">Issues found:</p>
                {data.topErrors.slice(0, 3).map((err) => (
                  <p key={err.error} className="text-xs">
                    • {VALIDATION_ERROR_MESSAGES[err.error]}: {err.count}
                  </p>
                ))}
                {onViewIssues && (
                  <p className="text-xs text-blue-400 mt-1">
                    Click to view all issues
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        )}

        {/* View Issues button (only if callback provided and has issues) */}
        {data.invalidCount > 0 && onViewIssues && (
          <button
            onClick={onViewIssues}
            className="text-xs text-blue-500 hover:text-blue-600 hover:underline ml-1"
          >
            View Issues
          </button>
        )}
      </div>
    </TooltipProvider>
  );
}

/**
 * Compact version for smaller spaces
 */
interface HealthIndicatorCompactProps {
  validCount: number;
  invalidCount: number;
  status: HealthStatus;
  className?: string;
}

export function HealthIndicatorCompact({
  validCount,
  invalidCount,
  status,
  className,
}: HealthIndicatorCompactProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
              config.bgColor,
              className
            )}
          >
            <Icon
              className={cn(
                'h-3 w-3',
                config.color,
                status === 'validating' && 'animate-spin'
              )}
            />
            <span className="text-green-600 dark:text-green-400 font-medium">
              {formatCount(validCount)}
            </span>
            {invalidCount > 0 && (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="text-orange-600 dark:text-orange-400 font-medium">
                  {formatCount(invalidCount)}
                </span>
              </>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {formatCount(validCount)} valid
            {invalidCount > 0 && `, ${formatCount(invalidCount)} invalid`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Loading state for when validation is running
 */
export function HealthIndicatorLoading({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-md border',
        'bg-blue-500/10 border-border/50',
        className
      )}
    >
      <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      <span className="text-sm text-muted-foreground">Validating records...</span>
    </div>
  );
}

/**
 * Helper to create HealthIndicatorData from validation results
 */
export function createHealthIndicatorData(
  validCount: number,
  invalidCount: number,
  errorsByType: Partial<Record<ValidationError, number>>,
  isValidating: boolean = false
): HealthIndicatorData {
  const totalCount = validCount + invalidCount;
  const rejectionRate = totalCount > 0 ? invalidCount / totalCount : 0;

  // Get top errors sorted by count
  const topErrors = Object.entries(errorsByType)
    .map(([error, count]) => ({ error: error as ValidationError, count: count || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  let status: HealthStatus;
  if (isValidating) {
    status = 'validating';
  } else if (rejectionRate <= 0.05) {
    status = 'healthy';
  } else if (rejectionRate <= 0.15) {
    status = 'warning';
  } else {
    status = 'critical';
  }

  return {
    status,
    validCount,
    invalidCount,
    totalCount,
    rejectionRate,
    topErrors,
  };
}
