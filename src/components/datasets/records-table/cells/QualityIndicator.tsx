/**
 * QualityIndicator
 *
 * Shows dry-run and/or finetune scores for a record.
 * Format: "Avg Dryrun: 0.85" or "Dryrun: 0.85" (single run).
 * Clickable — navigates to evaluation/jobs tab to see per-run details.
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
  /** Called when user clicks a score — navigate to evaluation/jobs tab */
  onNavigate?: (target: "evaluator" | "jobs") => void;
}

function getScoreColor(score: number): string {
  if (score >= 0.8) return "text-emerald-400";
  if (score >= 0.6) return "text-amber-400";
  return "text-red-400";
}

function ScoreLine({
  label,
  score,
  onClick,
}: {
  label: string;
  score: number;
  onClick?: () => void;
}) {
  const color = getScoreColor(score);
  return (
    <button
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
      className={cn(
        "inline-flex items-baseline gap-1 leading-tight text-left",
        onClick && "hover:underline cursor-pointer"
      )}
    >
      <span className="text-[11px] text-zinc-500 whitespace-nowrap">{label}:</span>
      <span className={cn("text-[11px] font-semibold tabular-nums", color)}>
        {score.toFixed(2)}
      </span>
    </button>
  );
}

export function QualityIndicator({ evaluation, className, onNavigate }: QualityIndicatorProps) {
  // Normalize: legacy records only have `score` (set by old dry-run code).
  const dryRunLatest = evaluation?.dryRunScore ?? (
    evaluation?.score != null && !evaluation?.finetuneScore ? evaluation.score : undefined
  );
  const dryRunAvg = evaluation?.dryRunAvg;
  const finetuneLatest = evaluation?.finetuneScore;
  const finetuneAvg = evaluation?.finetuneAvg;
  const dryRunCount = evaluation?.dryRunCount ?? (dryRunLatest != null ? 1 : 0);
  const finetuneCount = evaluation?.finetuneCount ?? 0;

  const hasDryRun = dryRunLatest != null;
  const hasFinetune = finetuneLatest != null;

  if (!hasDryRun && !hasFinetune) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <span className="text-[10px] text-zinc-600">&mdash;</span>
      </div>
    );
  }

  // Determine display values and labels
  const drScore = dryRunCount > 1 && dryRunAvg != null ? dryRunAvg : dryRunLatest!;
  const drLabel = dryRunCount > 1 ? "Avg Dryrun" : "Dryrun";
  const ftScore = finetuneCount > 1 && finetuneAvg != null ? finetuneAvg : finetuneLatest!;
  const ftLabel = finetuneCount > 1 ? "Avg Finetune" : "Finetune";

  // Tooltip with full detail
  const tooltipLines: string[] = [];
  if (hasDryRun) {
    if (dryRunCount > 1 && dryRunAvg != null) {
      tooltipLines.push(`Avg: ${dryRunAvg.toFixed(2)} across ${dryRunCount} dry runs`);
      tooltipLines.push(`Latest run: ${dryRunLatest!.toFixed(2)}`);
    } else {
      tooltipLines.push(`Dry run score: ${dryRunLatest!.toFixed(2)}`);
    }
    tooltipLines.push("Click to view runs →");
  }
  if (hasFinetune) {
    if (hasDryRun) tooltipLines.push(""); // separator
    if (finetuneCount > 1 && finetuneAvg != null) {
      tooltipLines.push(`Avg: ${finetuneAvg.toFixed(2)} across ${finetuneCount} finetune jobs`);
      tooltipLines.push(`Latest job: ${finetuneLatest!.toFixed(2)}`);
    } else {
      tooltipLines.push(`Finetune score: ${finetuneLatest!.toFixed(2)}`);
    }
    tooltipLines.push("Click to view jobs →");
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex flex-col items-start justify-center gap-0.5", className)}>
            {hasDryRun && (
              <ScoreLine
                label={drLabel}
                score={drScore}
                onClick={onNavigate ? () => onNavigate("evaluator") : undefined}
              />
            )}
            {hasFinetune && (
              <ScoreLine
                label={ftLabel}
                score={ftScore}
                onClick={onNavigate ? () => onNavigate("jobs") : undefined}
              />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          <div className="text-xs space-y-0.5">
            {tooltipLines.map((line, i) =>
              line === "" ? (
                <hr key={i} className="border-zinc-700 my-1" />
              ) : line.startsWith("Click") ? (
                <p key={i} className="text-zinc-500 text-[10px]">{line}</p>
              ) : (
                <p key={i}>{line}</p>
              )
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
