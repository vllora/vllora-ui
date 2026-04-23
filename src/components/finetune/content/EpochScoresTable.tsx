/**
 * EpochScoresTable
 *
 * Displays epoch-by-epoch evaluation scores in a compact table format.
 * Shown in the expanded row of the Per-Row results table.
 */

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { FileText, Copy, Check } from "lucide-react";
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
  rolloutContent?: string | null;
}

interface EpochScoresTableProps {
  epochs: EpochScore[];
  criteriaNames: string[];
  /** Compact mode — only shows Eval, Score, Δ columns. Used in the drawer panel. */
  compact?: boolean;
}

function CopyableCell({ text, maxChars, className }: { readonly text: string; readonly maxChars?: number; readonly className?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-1 group/copy cursor-help", className)}>
            <span className="block truncate">{maxChars ? text.slice(0, maxChars) : text}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleCopy(); }}
              className="shrink-0 opacity-0 group-hover/copy:opacity-100 transition-opacity p-0.5 hover:bg-zinc-700/50 rounded"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5 text-zinc-500" />}
            </button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md text-xs whitespace-pre-wrap bg-zinc-900 border-zinc-700/60">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function EpochScoresTable({
  epochs = [],
  criteriaNames = [],
  compact = false,
}: EpochScoresTableProps) {
  const [selectedLogs, setSelectedLogs] = useState<{
    epoch: number;
    logs: string[];
  } | null>(null);
  const hasLogs = epochs.some((e) => e.logs && e.logs.length > 0);
  const hasRollout = epochs.some((e) => e.rolloutContent != null && e.rolloutContent !== "");

  return (
    <>
      <div className="text-[11px] overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              <th className="text-left py-1.5 pr-3 w-14" title="Evaluation checkpoint">Eval</th>
              {!compact && criteriaNames.map((c) => (
                <th key={c} className="text-left py-1.5 pr-3 w-16">
                  {c}
                </th>
              ))}
              {hasRollout && <th className="text-left py-1.5 pr-3">Response</th>}
              <th className="text-left py-1.5 pr-2">Reasoning</th>
              <th className="text-right py-1.5 pr-4 w-16">Score</th>
              <th className="text-center py-1.5 w-8">{hasLogs ? "Logs" : ""}</th>
            </tr>
          </thead>
          <tbody>
            {epochs.map((e, idx) => {
              const hasRowLogs = e.logs && e.logs.length > 0;
              // Count how many entries share this epoch to label candidates
              const sameEpochEntries = epochs.filter(x => x.epoch === e.epoch);
              const candidateIdx = sameEpochEntries.indexOf(e);
              const hasCandidates = sameEpochEntries.length > 1;
              // Compute delta: compare best score of this epoch vs best of previous epoch
              const prevEpochNum = [...new Set(epochs.map(x => x.epoch))].sort((a, b) => a - b);
              const thisEpochIdx = prevEpochNum.indexOf(e.epoch);
              const prevBest = thisEpochIdx > 0
                ? Math.max(...epochs.filter(x => x.epoch === prevEpochNum[thisEpochIdx - 1]).map(x => x.score))
                : null;
              const delta = prevBest != null && candidateIdx === 0 ? e.score - prevBest : null;

              return (
                <tr
                  key={`${e.epoch}-${idx}`}
                  className="border-t border-zinc-800/30"
                >
                  <td className="py-1.5 pr-3 font-mono text-zinc-400 tabular-nums">
                    {e.epoch + 1}
                    {hasCandidates && (
                      <span
                        className="text-zinc-600 text-[9px] ml-0.5 cursor-help"
                        title={`Response candidate ${candidateIdx + 1} of ${sameEpochEntries.length}. In RFT, multiple responses are generated and scored — the model learns from score differences between them.`}
                      >
                        ({String.fromCharCode(97 + candidateIdx)})
                      </span>
                    )}
                  </td>
                  {criteriaNames.length > 0 && !compact && criteriaNames.map((c) => (
                    <td
                      key={c}
                      className={cn(
                        "py-1.5 pr-3 font-mono tabular-nums",
                        e.breakdown.criteria[c] !== undefined
                          ? getScoreColorClass(e.breakdown.criteria[c])
                          : "text-zinc-600"
                      )}
                    >
                      {e.breakdown.criteria[c] !== undefined
                        ? formatScore(e.breakdown.criteria[c])
                        : "-"}
                    </td>
                  ))}
                  {hasRollout && (
                    <td className={cn("py-1.5 pr-3", compact ? "max-w-[150px]" : "max-w-[200px]")}>
                      {e.rolloutContent ? (
                        <CopyableCell text={e.rolloutContent} maxChars={80} className="text-zinc-400" />
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  )}
                  <td className={cn("py-1.5 pr-2 text-zinc-500", compact ? "max-w-[200px]" : "max-w-[320px]")}>
                    {e.breakdown.reasoning ? (
                      <CopyableCell text={e.breakdown.reasoning} className="text-zinc-500" />
                    ) : (
                      <span className="text-zinc-600">-</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-4 text-right">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      <span
                        className={cn(
                          "font-mono font-semibold tabular-nums",
                          getScoreColorClass(e.score)
                        )}
                      >
                        {formatScore(e.score)}
                      </span>
                      {delta != null && delta !== 0 && (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={cn(
                                  "text-[9px] font-mono cursor-help",
                                  delta > 0 ? "text-emerald-500" : "text-red-400"
                                )}
                              >
                                {delta > 0 ? "+" : ""}{(delta * 100).toFixed(0)}%
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="text-[10px] bg-zinc-900 border-zinc-700/60"
                            >
                              Score change from previous evaluation ({delta > 0 ? "+" : ""}{delta.toFixed(2)})
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </span>
                  </td>
                  <td className="py-1.5 text-center w-8">
                    {hasRowLogs && (
                      <button
                        onClick={() =>
                          setSelectedLogs({ epoch: e.epoch, logs: e.logs! })
                        }
                        className="p-0.5 hover:bg-zinc-800 rounded transition-colors"
                        title="View logs"
                      >
                        <FileText className="h-3 w-3 text-zinc-500 hover:text-zinc-300" />
                      </button>
                    )}
                  </td>
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
