/**
 * CoverageIndicator
 *
 * Displays topic coverage percentage with color-coded progress bar and tooltip.
 * Color is based on both percentage AND absolute record count for training viability.
 */

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Minimum record thresholds for training viability
// Coverage indicator should consider BOTH percentage and absolute count
const MIN_RECORDS_GREEN = 50;   // Need 50+ records for "good" coverage
const MIN_RECORDS_YELLOW = 20;  // 20-50 records is "medium"
const MIN_RECORDS_ORANGE = 10;  // 10-20 records is "low"
// < 10 records is "critical" regardless of percentage

/**
 * Get coverage indicator color based on both percentage AND absolute count.
 * Even if a topic has 100% of records, if it's only 1 record, that's not healthy.
 */
function getCoverageColor(percentage: number, absoluteCount: number): string {
  // Determine color based on percentage
  const percentageColor = percentage >= 20 ? 'green' :
                          percentage >= 10 ? 'yellow' :
                          percentage >= 5 ? 'orange' : 'red';

  // Determine color based on absolute count
  const countColor = absoluteCount >= MIN_RECORDS_GREEN ? 'green' :
                     absoluteCount >= MIN_RECORDS_YELLOW ? 'yellow' :
                     absoluteCount >= MIN_RECORDS_ORANGE ? 'orange' : 'red';

  // Use the worse of the two (more conservative/cautious)
  const colorOrder = ['red', 'orange', 'yellow', 'green'];
  const worstIndex = Math.min(colorOrder.indexOf(percentageColor), colorOrder.indexOf(countColor));

  return colorOrder[worstIndex];
}

function getCoverageColorClass(color: string, type: 'bg' | 'text'): string {
  const colorMap: Record<string, { bg: string; text: string }> = {
    green: { bg: 'bg-emerald-500', text: 'text-emerald-500' },
    yellow: { bg: 'bg-yellow-500', text: 'text-yellow-500' },
    orange: { bg: 'bg-orange-500', text: 'text-orange-500' },
    red: { bg: 'bg-red-500', text: 'text-red-500' },
  };
  return colorMap[color]?.[type] ?? colorMap.red[type];
}

/**
 * Generate tooltip content explaining coverage status
 */
function getCoverageTooltip(color: string, percentage: number, count: number): { status: string; explanation: string; suggestion: string } {
  const statusMap: Record<string, string> = {
    green: 'Good coverage',
    yellow: 'Medium coverage',
    orange: 'Low coverage',
    red: 'Critical - insufficient for training',
  };

  // Check which threshold is limiting
  const percentageColor = percentage >= 20 ? 'green' : percentage >= 10 ? 'yellow' : percentage >= 5 ? 'orange' : 'red';
  const countColor = count >= MIN_RECORDS_GREEN ? 'green' : count >= MIN_RECORDS_YELLOW ? 'yellow' : count >= MIN_RECORDS_ORANGE ? 'orange' : 'red';

  const explanation = `${count} records (${percentage.toFixed(1)}% of dataset)`;
  let suggestion = '';

  if (color === 'green') {
    suggestion = 'Ready for training';
  } else if (countColor !== 'green' && percentageColor === 'green') {
    // Count is the limiting factor
    const needed = color === 'red' ? MIN_RECORDS_ORANGE : color === 'orange' ? MIN_RECORDS_YELLOW : MIN_RECORDS_GREEN;
    suggestion = `Need ${needed - count} more records`;
  } else if (percentageColor !== 'green' && countColor === 'green') {
    // Percentage is the limiting factor (other topics have too many)
    suggestion = 'Other topics are over-represented';
  } else {
    // Both are limiting
    const neededCount = color === 'red' ? MIN_RECORDS_ORANGE : color === 'orange' ? MIN_RECORDS_YELLOW : MIN_RECORDS_GREEN;
    suggestion = `Need ${Math.max(0, neededCount - count)} more records`;
  }

  return {
    status: statusMap[color] || 'Unknown',
    explanation,
    suggestion,
  };
}

export interface CoverageIndicatorProps {
  /** Coverage percentage (0-100) */
  coveragePercentage: number;
  /** Record count for this topic */
  recordCount: number;
}

export function CoverageIndicator({ coveragePercentage, recordCount }: CoverageIndicatorProps) {
  const coverageColor = getCoverageColor(coveragePercentage, recordCount);
  const tooltip = getCoverageTooltip(coverageColor, coveragePercentage, recordCount);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-help flex-shrink-0">
            {/* Progress bar */}
            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  getCoverageColorClass(coverageColor, 'bg')
                )}
                style={{ width: `${Math.min(coveragePercentage * 5, 100)}%` }}
              />
            </div>
            {/* Percentage text */}
            <span className={cn(
              "text-[10px] font-medium tabular-nums",
              getCoverageColorClass(coverageColor, 'text')
            )}>
              {coveragePercentage.toFixed(1)}%
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[200px]">
          <div className="text-xs space-y-1">
            <p className={cn("font-semibold", getCoverageColorClass(coverageColor, 'text'))}>
              {tooltip.status}
            </p>
            <p className="text-muted-foreground">{tooltip.explanation}</p>
            <p className="text-foreground">{tooltip.suggestion}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
