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

interface CoverageTooltipContent {
  headline: string;
  description: string;
  whyItMatters: string;
  howToImprove: string;
}

/**
 * Generate tooltip content explaining coverage status in beginner-friendly terms
 */
function getCoverageTooltip(color: string, percentage: number, count: number): CoverageTooltipContent {
  const exampleWord = count === 1 ? 'example' : 'examples';
  const headline = `Topic coverage: ${percentage.toFixed(0)}% (${count} ${exampleWord})`;
  const description = 'This tells you how much of your training data is about this topic.';

  let whyItMatters = '';
  let howToImprove = '';

  if (color === 'green') {
    whyItMatters = 'With enough examples, the model will learn this topic reliably.';
    howToImprove = 'You have good coverage. Ready to train!';
  } else if (color === 'yellow') {
    whyItMatters = 'The model will learn this topic, but more examples would make it more consistent.';
    const needed = Math.max(MIN_RECORDS_GREEN - count, 10);
    howToImprove = `Add ~${needed} more examples for this topic (or its subtopics) for best results.`;
  } else if (color === 'orange') {
    whyItMatters = 'With few examples, the model may be inconsistent on questions in this topic.';
    const needed = Math.max(MIN_RECORDS_YELLOW - count, 10);
    howToImprove = `Add ${needed}+ examples for this topic (or its subtopics) to improve reliability.`;
  } else {
    whyItMatters = 'With too few examples, the model may be inconsistent or guess on questions in this topic.';
    const needed = Math.max(MIN_RECORDS_ORANGE - count, 10);
    howToImprove = `Add ${needed}+ examples for this topic (or its subtopics) to make results more reliable.`;
  }

  return {
    headline,
    description,
    whyItMatters,
    howToImprove,
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
                style={{ width: `${Math.min(coveragePercentage, 100)}%` }}
              />
            </div>
            {/* Percentage text */}
            <span className={cn(
              "text-[10px] w-[35px] overflow-hidden text-ellipsis whitespace-nowrap    font-medium tabular-nums",
              getCoverageColorClass(coverageColor, 'text')
            )}>
              {coveragePercentage.toFixed(1)}%
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[300px]">
          <div className="text-xs space-y-2.5">
            {/* Headline */}
            <div>
              <p className={cn("font-semibold", getCoverageColorClass(coverageColor, 'text'))}>
                {tooltip.headline}
              </p>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                {tooltip.description}
              </p>
            </div>

            {/* Why it matters */}
            <div>
              <p className="font-medium text-foreground text-[11px]">Why it matters</p>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                {tooltip.whyItMatters}
              </p>
            </div>

            {/* How to improve */}
            <div>
              <p className="font-medium text-foreground text-[11px]">How to improve</p>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                {tooltip.howToImprove}
              </p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
