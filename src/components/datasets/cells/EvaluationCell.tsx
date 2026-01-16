/**
 * EvaluationCell
 *
 * Displays a record's evaluation status with badge styling.
 */

import { DatasetEvaluation } from "@/types/dataset-types";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import { COLUMN_WIDTHS } from "../table-columns";

interface EvaluationCellProps {
  evaluation?: DatasetEvaluation;
  /** Fixed width layout for table view */
  tableLayout?: boolean;
}

// Get color based on score value (1-5 scale assumed)
const getScoreColor = (score: number): string => {
  if (score >= 4) return "bg-emerald-500/15 text-emerald-500";
  if (score >= 3) return "bg-amber-500/15 text-amber-500";
  return "bg-orange-500/15 text-orange-400";
};

export function EvaluationCell({
  evaluation,
  tableLayout = false,
}: EvaluationCellProps) {
  const hasScore = evaluation?.score !== undefined;

  return (
    <div
      className={cn(
        "shrink-0 flex justify-center",
        tableLayout ? COLUMN_WIDTHS.evaluation : "min-w-[100px]"
      )}
    >
      {hasScore ? (
        <span
          className={cn(
            "text-[11px] font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1",
            getScoreColor(evaluation.score!)
          )}
        >
          <Star className="w-3 h-3 fill-current" />
          {evaluation.score}
        </span>
      ) : (
        <span className="text-[11px] text-muted-foreground/50">
          —
        </span>
      )}
    </div>
  );
}
