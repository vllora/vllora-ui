/**
 * BalanceRatingTooltip
 *
 * Tooltip wrapper for the balance rating badge that explains
 * what the rating means and how it's calculated.
 */

import { BarChart3 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type BalanceRating = "excellent" | "good" | "fair" | "poor" | "critical";

export interface BalanceRatingTooltipProps {
  rating: BalanceRating;
  score?: number;
  colorClass: string;
  bgColorClass: string;
}

const RATING_DESCRIPTIONS: Record<BalanceRating, string> = {
  excellent: "Your data is well-distributed across topics. Ready for training.",
  good: "Your data has good coverage. Minor adjustments may improve results.",
  fair: "Some topics are under-represented. Consider adding more data to weaker areas.",
  poor: "Significant imbalance detected. The model may underperform on some topics.",
  critical: "Severe imbalance. Training may produce biased results.",
};

export function BalanceRatingTooltip({
  rating,
  score,
  colorClass,
  bgColorClass,
}: BalanceRatingTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full cursor-help ${bgColorClass}`}>
            <BarChart3 className={`w-3 h-3 ${colorClass}`} />
            <span className={`text-xs font-medium capitalize ${colorClass}`}>
              {rating}
            </span>
            {score !== undefined && (
              <span className="text-xs text-zinc-500">
                ({Math.round(score * 100)}%)
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="max-w-[280px]">
          <div className="text-xs space-y-2">
            <div className="flex items-center gap-2">
              <span className={`font-semibold capitalize ${colorClass}`}>{rating}</span>
              {score !== undefined && (
                <span className="text-muted-foreground">
                  Balance Score: {Math.round(score * 100)}%
                </span>
              )}
            </div>
            <p className="text-muted-foreground">
              {RATING_DESCRIPTIONS[rating]}
            </p>
            <div className="border-t border-zinc-700 pt-2">
              <p className="text-[10px] text-muted-foreground">
                Balance measures how evenly records are distributed across topics.
                A score of 100% means perfect distribution.
              </p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
