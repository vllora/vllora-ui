/**
 * QualityIndicator
 *
 * Compact quality score badge for record rows.
 * Shows the evaluation score as a colored dot + number.
 * Score range: 0-1 (from dry run / finetune evaluations).
 */

import { cn } from "@/lib/utils";
import type { DatasetEvaluation } from "@/types/dataset-types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface QualityIndicatorProps {
  evaluation?: DatasetEvaluation;
  className?: string;
}

function getScoreColor(score: number): { dot: string; text: string; bg: string } {
  if (score >= 0.8) return { dot: "bg-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10" };
  if (score >= 0.6) return { dot: "bg-amber-500", text: "text-amber-400", bg: "bg-amber-500/10" };
  return { dot: "bg-red-500", text: "text-red-400", bg: "bg-red-500/10" };
}

export function QualityIndicator({ evaluation, className }: QualityIndicatorProps) {
  if (!evaluation?.score && evaluation?.score !== 0) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <span className="text-[10px] text-zinc-600">—</span>
      </div>
    );
  }

  const score = evaluation.score;
  const colors = getScoreColor(score);

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center justify-center", className)}>
            <span
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium tabular-nums",
                colors.bg, colors.text
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />
              {score.toFixed(2)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          <p className="text-xs">
            Quality score: {score.toFixed(2)}
            {evaluation.feedback && (
              <span className="block text-muted-foreground mt-0.5">{evaluation.feedback}</span>
            )}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
