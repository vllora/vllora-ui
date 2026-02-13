/**
 * EpochScoresTable
 *
 * Displays epoch-by-epoch evaluation scores in a table format.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FileText, HelpCircle } from "lucide-react";
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
              <th className="text-left py-1 pr-2 w-16">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 cursor-help">
                        Score
                        <HelpCircle className="h-3 w-3 text-muted-foreground/60" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[260px] text-xs p-3">
                      <p className="font-semibold mb-2">Score Color Guide</p>
                      <div className="space-y-1.5">
                        <p><span className="text-green-400 font-medium">Green ≥ 0.8</span> — High</p>
                        <p><span className="text-yellow-400 font-medium">Yellow ≥ 0.6</span> — Moderate</p>
                        <p><span className="text-red-400 font-medium">Red &lt; 0.6</span> — Low</p>
                      </div>
                      <p className="text-muted-foreground mt-2 border-t border-zinc-700 pt-2">
                        Early epochs typically score lower — look for an upward trend across epochs.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </th>
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
