/**
 * RowDetailCard
 *
 * Expandable card showing evaluation details for a single training row.
 */

import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  getScoreColorClass,
  getScoreBgClass,
  formatScore,
  type ScoreBreakdown,
} from "@/utils/parse-score-breakdown";
import { type Message } from "./utils";

export interface RowData {
  rowIndex: number;
  inputMessages: Message[];
  outputMessage: Message | null;
  epochs: {
    epoch: number;
    score: number;
    breakdown: ScoreBreakdown;
  }[];
}

interface RowDetailCardProps {
  row: RowData;
  isExpanded: boolean;
  onToggle: () => void;
  criteriaNames: string[];
}

export function RowDetailCard({
  row,
  isExpanded,
  onToggle,
  criteriaNames,
}: RowDetailCardProps) {
  const latestEpoch = row.epochs[row.epochs.length - 1];
  const latestScore = latestEpoch?.score ?? 0;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </div>

        <span className="text-xs font-mono text-muted-foreground w-12">
          #{row.rowIndex}
        </span>

        <span className="text-xs flex-1 truncate" title={getPromptPreview(row.inputMessages)}>
          {getPromptPreview(row.inputMessages)}
        </span>

        <div className="flex items-center gap-2">
          {/* Mini epoch indicators */}
          <div className="flex gap-0.5">
            {row.epochs.map((e, idx) => (
              <div
                key={`${e.epoch}-${idx}`}
                className={cn(
                  "w-2 h-2 rounded-full",
                  e.score >= 0.8
                    ? "bg-green-500"
                    : e.score >= 0.6
                    ? "bg-yellow-500"
                    : "bg-red-500"
                )}
                title={`Epoch ${e.epoch}: ${formatScore(e.score)}`}
              />
            ))}
          </div>

          <span
            className={cn(
              "text-xs font-medium px-1.5 py-0.5 rounded",
              getScoreBgClass(latestScore),
              getScoreColorClass(latestScore)
            )}
          >
            {formatScore(latestScore)}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 py-2 border-t bg-muted/20 space-y-3">
          {/* Input Messages */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Input
            </span>
            <div className="space-y-1.5">
              {row.inputMessages.map((msg, idx) => (
                <div key={idx} className="text-xs">
                  <span
                    className={cn(
                      "font-medium px-1.5 py-0.5 rounded mr-2",
                      msg.role === "system"
                        ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                        : msg.role === "user"
                        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                        : "bg-green-500/15 text-green-600 dark:text-green-400"
                    )}
                  >
                    {msg.role}
                  </span>
                  <span className="font-mono text-foreground/80 whitespace-pre-wrap">
                    {msg.content}
                  </span>
                </div>
              ))}
              {row.inputMessages.length === 0 && (
                <div className="text-xs text-muted-foreground italic">
                  No input messages
                </div>
              )}
            </div>
          </div>

          {/* Output Message */}
          {row.outputMessage && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Model Output
              </span>
              <div className="text-xs p-2 bg-green-500/10 rounded border border-green-500/20">
                <span className="font-mono text-foreground/80 whitespace-pre-wrap">
                  {row.outputMessage.content}
                </span>
              </div>
            </div>
          )}

          {/* Epoch scores table */}
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
                  <th className="text-left py-1">Reasoning</th>
                </tr>
              </thead>
              <tbody>
                {row.epochs.map((e, idx) => (
                  <tr key={`${e.epoch}-${idx}`} className="border-t border-border/50">
                    <td className="py-1 pr-2 font-mono">{e.epoch}</td>
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
                    <td className="py-1 text-muted-foreground truncate max-w-[200px]">
                      {e.breakdown.reasoning || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function getPromptPreview(inputMessages: Message[]): string {
  // Find the last user message for preview
  for (let i = inputMessages.length - 1; i >= 0; i--) {
    if (inputMessages[i].role === "user") {
      const content = inputMessages[i].content;
      return content.length > 80 ? content.slice(0, 80) + "..." : content;
    }
  }
  if (inputMessages[0]?.content) {
    const content = inputMessages[0].content;
    return content.length > 80 ? content.slice(0, 80) + "..." : content;
  }
  return "No prompt available";
}
