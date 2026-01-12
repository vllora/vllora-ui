/**
 * EvaluationCell
 *
 * Displays a record's evaluation status with badge styling.
 */

import { DatasetEvaluation } from "@/types/dataset-types";
import { cn } from "@/lib/utils";

interface EvaluationCellProps {
  evaluation?: DatasetEvaluation;
  /** Fixed width layout for table view */
  tableLayout?: boolean;
}

export function EvaluationCell({
  evaluation,
  tableLayout = false,
}: EvaluationCellProps) {
  const hasScore = evaluation?.score !== undefined;

  return (
    <div
      className={cn(
        "shrink-0 flex justify-center",
        tableLayout ? "w-28" : "min-w-[100px]"
      )}
    >
      {hasScore ? (
        <span className="text-xs font-medium px-3 py-1 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
          Score: {evaluation.score}
        </span>
      ) : (
        <span className="text-xs font-medium px-3 py-1 rounded bg-muted text-muted-foreground border border-border">
          Pending
        </span>
      )}
    </div>
  );
}
