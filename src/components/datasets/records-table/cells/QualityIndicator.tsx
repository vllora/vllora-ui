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
  /** Compact mode: colored dot + small score number */
  compact?: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 0.8) return "text-emerald-400";
  if (score >= 0.6) return "text-amber-400";
  return "text-red-400";
}

function getScoreDotColor(score: number): string {
  if (score >= 0.8) return "bg-emerald-400";
  if (score >= 0.6) return "bg-amber-400";
  return "bg-red-400";
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

export function QualityIndicator({ evaluation, className, onNavigate, compact }: QualityIndicatorProps) {
  // Normalize: legacy records only have `score` (set by old dry-run code).
  const dryRunLatest = evaluation?.evalScore ?? (
    evaluation?.score != null && !evaluation?.finetuneScore ? evaluation.score : undefined
  );
  const dryRunAvg = evaluation?.dryRunAvg;
  const finetuneLatest = evaluation?.finetuneScore;
  const finetuneAvg = evaluation?.finetuneAvg;
  const evalCount = evaluation?.evalCount ?? (dryRunLatest != null ? 1 : 0);
  const finetuneCount = evaluation?.finetuneCount ?? 0;

  const hasDryRun = dryRunLatest != null;
  const hasFinetune = finetuneLatest != null;

  // Determine display values and labels
  const drScore = hasDryRun ? (evalCount > 1 && dryRunAvg != null ? dryRunAvg : dryRunLatest!) : undefined;
  const drLabel = evalCount > 1 ? "Avg Evaluation" : "Evaluation";
  const ftScore = hasFinetune ? (finetuneCount > 1 && finetuneAvg != null ? finetuneAvg : finetuneLatest!) : undefined;
  const ftLabel = finetuneCount > 1 ? "Avg Finetune" : "Finetune";

  // Tooltip with full detail (shared between modes)
  const tooltipLines: string[] = [];
  if (hasDryRun) {
    if (evalCount > 1 && dryRunAvg != null) {
      tooltipLines.push(`Avg: ${dryRunAvg.toFixed(2)} across ${evalCount} evaluations`);
      tooltipLines.push(`Latest run: ${dryRunLatest!.toFixed(2)}`);
    } else {
      tooltipLines.push(`Evaluation score: ${dryRunLatest!.toFixed(2)}`);
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

  // ─── No scores at all ───────────────────────────────────────────────────────
  if (!hasDryRun && !hasFinetune) {
    if (compact) {
      return (
        <div className={cn("flex items-center gap-1 shrink-0", className)}>
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
        </div>
      );
    }
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <span className="text-[10px] text-zinc-600">&mdash;</span>
      </div>
    );
  }

  // ─── Compact mode: colored dot + score number ───────────────────────────────
  if (compact) {
    // Pick the primary score to display (prefer dry run, fallback to finetune)
    const primaryScore = drScore ?? ftScore!;
    const primaryTarget = hasDryRun ? "evaluator" as const : "jobs" as const;

    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onNavigate ? (e) => { e.stopPropagation(); onNavigate(primaryTarget); } : undefined}
              className={cn(
                "flex items-center gap-1.5 shrink-0 cursor-pointer",
                onNavigate && "hover:underline",
                className
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", getScoreDotColor(primaryScore))} />
              <span className={cn("text-[10px] tabular-nums font-medium", getScoreColor(primaryScore))}>
                {primaryScore.toFixed(2)}
              </span>
            </button>
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

  // ─── Default mode: full score lines ─────────────────────────────────────────
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex flex-col items-start justify-center gap-0.5", className)}>
            {hasDryRun && (
              <ScoreLine
                label={drLabel}
                score={drScore!}
                onClick={onNavigate ? () => onNavigate("evaluator") : undefined}
              />
            )}
            {hasFinetune && (
              <ScoreLine
                label={ftLabel}
                score={ftScore!}
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
