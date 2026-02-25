/**
 * EvalHealthCard — Evaluation health stat card showing current score,
 * delta from previous, and criteria count.
 */

import { Target, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function EvalHealthCard({
  currentScore,
  prevScore,
  criteriaCount,
  onClick,
}: {
  currentScore?: number;
  prevScore?: number;
  criteriaCount?: number;
  onClick?: () => void;
}) {
  const hasScore = currentScore != null;
  const scorePercent = hasScore ? Math.round(currentScore * 100) : null;
  const delta =
    hasScore && prevScore != null
      ? Math.round((currentScore - prevScore) * 100 * 10) / 10
      : null;

  return (
    <button
      onClick={onClick}
      className="h-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-4 text-left hover:border-[rgb(var(--theme-500))]/50 transition-colors w-full"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          Evaluation Health
        </span>
        <Target className="w-3.5 h-3.5 text-muted-foreground/60" />
      </div>
      {hasScore ? (
        <>
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-2xl font-bold leading-none">{scorePercent}%</span>
            {delta !== null && (
              <span
                className={cn(
                  "flex items-center text-[10px] font-semibold",
                  delta >= 0 ? "text-green-500" : "text-destructive"
                )}
              >
                {delta >= 0 ? (
                  <ArrowUp className="w-3 h-3" />
                ) : (
                  <ArrowDown className="w-3 h-3" />
                )}
                {delta >= 0 ? "+" : ""}
                {delta}%
              </span>
            )}
          </div>
          {/* Score progress bar */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full bg-[rgb(var(--theme-500))] rounded-full transition-all"
              style={{ width: `${scorePercent}%` }}
            />
          </div>
          <div className="text-[9px] text-muted-foreground">
            Average score{criteriaCount != null ? ` across ${criteriaCount} criteria` : ""}
          </div>
        </>
      ) : (
        <div className="text-xs text-muted-foreground py-1">No evaluations yet</div>
      )}
    </button>
  );
}
