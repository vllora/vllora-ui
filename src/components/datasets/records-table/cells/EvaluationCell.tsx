/**
 * EvaluationCell
 *
 * Displays a record's evaluation status with badge styling.
 */

import { DatasetEvaluation } from "@/types/dataset-types";
import { cn } from "@/lib/utils";
import { COLUMN_WIDTHS } from "../../table-columns";

interface EvaluationCellProps {
  evaluation?: DatasetEvaluation;
  /** Fixed width layout for table view */
  tableLayout?: boolean;
}

/** Normalize score to 0-1 range. Legacy 1-5 scores are divided by 5. */
function normalizeScore(score: number): number {
  return score > 1 ? score / 5 : score;
}

/** Get dot + text color based on normalized 0-1 score */
function getScoreStyle(score: number): { dot: string; badge: string } {
  if (score >= 0.8) return { dot: "bg-emerald-400", badge: "bg-emerald-500/15 text-emerald-500" };
  if (score >= 0.6) return { dot: "bg-amber-400", badge: "bg-amber-500/15 text-amber-500" };
  return { dot: "bg-red-400", badge: "bg-red-500/15 text-red-400" };
}

export function EvaluationCell({
  evaluation,
  tableLayout = false,
}: EvaluationCellProps) {
  const hasScore = evaluation?.score !== undefined;
  const normalized = hasScore ? normalizeScore(evaluation.score!) : undefined;

  return (
    <div
      className={cn(
        "shrink-0 flex justify-center",
        tableLayout ? COLUMN_WIDTHS.evaluation : "min-w-[100px]"
      )}
    >
      {normalized !== undefined ? (
        <span
          className={cn(
            "text-[11px] font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1.5",
            getScoreStyle(normalized).badge
          )}
        >
          <span className={cn("w-2 h-2 rounded-full", getScoreStyle(normalized).dot)} />
          {normalized.toFixed(2)}
        </span>
      ) : (
        <span className="text-[11px] text-muted-foreground/50">
          —
        </span>
      )}
    </div>
  );
}
