/**
 * EpochScoresTable
 *
 * Displays epoch-by-epoch evaluation scores in a table format.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";
import {
  getScoreColorClass,
  formatScore,
  type ScoreBreakdown,
} from "@/utils/parse-score-breakdown";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LogsDialog } from "./LogsDialog";

export interface EpochScore {
  epoch: number;
  score: number;
  breakdown: ScoreBreakdown;
  logs?: string[];
}

interface EpochScoresTableProps {
  epochs: EpochScore[];
  criteriaNames: string[];
}

export function EpochScoresTable({
  epochs,
  criteriaNames,
}: EpochScoresTableProps) {
  const [selectedLogs, setSelectedLogs] = useState<{
    epoch: number;
    logs: string[];
  } | null>(null);
  const hasLogs = epochs.some((e) => e.logs && e.logs.length > 0);

  return (
    <>
      <div className="text-xs overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left py-1 pr-2 w-16">Epoch</th>
              <th className="text-left py-1 pr-2 w-16">Score</th>
              {criteriaNames.map((c) => (
                <th key={c} className="text-left py-1 pr-2 w-16">
                  {c}
                </th>
              ))}
              <th className="text-left py-1 pr-2">Reasoning</th>
              {hasLogs && <th className="text-center py-1 w-12">Logs</th>}
            </tr>
          </thead>
          <tbody>
            {epochs.map((e, idx) => {
              const hasRowLogs = e.logs && e.logs.length > 0;

              return (
                <tr
                  key={`${e.epoch}-${idx}`}
                  className="border-t border-border/50"
                >
                  <td className="py-1 pr-2 font-mono">{`${e.epoch}-${idx}`}</td>
                  <td
                    className={cn(
                      "py-1 pr-2 font-mono",
                      getScoreColorClass(e.score)
                    )}
                  >
                    {formatScore(e.score)}
                  </td>
                  {criteriaNames.map((c) => (
                    <td
                      key={c}
                      className={cn(
                        "py-1 pr-2 font-mono",
                        e.breakdown.criteria[c] !== undefined
                          ? getScoreColorClass(e.breakdown.criteria[c])
                          : "text-muted-foreground"
                      )}
                    >
                      {e.breakdown.criteria[c] !== undefined
                        ? formatScore(e.breakdown.criteria[c])
                        : "-"}
                    </td>
                  ))}
                  <td className="py-1 pr-2 text-muted-foreground max-w-[200px]">
                    {e.breakdown.reasoning ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate cursor-help">
                              {e.breakdown.reasoning}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-md text-xs whitespace-pre-wrap"
                          >
                            {e.breakdown.reasoning}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      "-"
                    )}
                  </td>
                  {hasLogs && (
                    <td className="py-1 text-center">
                      {hasRowLogs && (
                        <button
                          onClick={() =>
                            setSelectedLogs({ epoch: e.epoch, logs: e.logs! })
                          }
                          className="p-0.5 hover:bg-muted rounded"
                          title="View logs"
                        >
                          <FileText className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Logs Dialog */}
      <LogsDialog
        open={selectedLogs !== null}
        onOpenChange={(open) => !open && setSelectedLogs(null)}
        epoch={selectedLogs?.epoch ?? 0}
        logs={selectedLogs?.logs ?? []}
      />
    </>
  );
}
