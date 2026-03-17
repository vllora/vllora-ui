/**
 * DryrunEvaluationResultRow
 *
 * Clean, minimal row for evaluation results.
 * Columns: # | Input (user question) | Score (colored) | Status (✓/✗) | Logs
 */

import { cn } from "@/lib/utils";
import type { FlatEvaluationResult } from "@/services/finetune-api";
import { getScoreColorClass, formatScore } from "@/utils/parse-score-breakdown";
import { LogsPopover } from "./LogsPopover";

interface DryrunEvaluationResultRowProps {
  readonly result: FlatEvaluationResult;
  readonly index: number;
  readonly isHighlighted?: boolean;
  readonly onClick?: () => void;
}

/** Extract the first user message from the row data as the input text */
function getInputText(row?: { messages?: unknown[]; [key: string]: unknown }): string {
  if (!row?.messages || !Array.isArray(row.messages)) return "—";
  const userMsg = row.messages.find(
    (m: unknown) => {
      const msg = m as Record<string, unknown>;
      return msg?.role === "user" && typeof msg?.content === "string";
    },
  ) as { content: string } | undefined;
  if (!userMsg) return "—";
  return userMsg.content.trim();
}

export function DryrunEvaluationResultRow({
  result,
  index,
  isHighlighted,
  onClick,
}: DryrunEvaluationResultRowProps) {
  const isSuccess = result.status === "completed" && !result.error_message;
  const isFailed = result.status === "failed" || !!result.error_message;
  const isPending = result.status === "pending" || result.status === "running";
  const hasLogs = result.logs && result.logs.length > 0;
  const inputText = getInputText(result.row);

  return (
    <div
      className={cn(
        "group flex items-center border-b border-zinc-800/40 h-[38px]",
        onClick && "cursor-pointer hover:bg-zinc-800/20",
        isHighlighted && "animate-record-highlight",
      )}
      onClick={onClick}
    >
      {/* # */}
      <div className="w-10 shrink-0 px-3 font-mono text-[11px] text-zinc-600 tabular-nums">
        {index + 1}
      </div>

      {/* Input */}
      <div className={cn(
        "flex-1 min-w-0 pr-4 text-[12px] text-zinc-300 truncate",
        onClick && "group-hover:underline group-hover:text-zinc-100",
      )}>
        {inputText}
      </div>

      {/* Score */}
      <div className="w-16 shrink-0 text-right pr-4">
        {result.score != null && !isPending ? (
          <span
            className={cn(
              "font-mono text-[13px] font-semibold tabular-nums",
              isSuccess
                ? getScoreColorClass(result.score)
                : "text-zinc-500",
            )}
          >
            {formatScore(result.score)}
          </span>
        ) : isPending ? (
          <div className="inline-block h-3 w-3 rounded-full border-2 border-zinc-600 border-t-zinc-400 animate-spin" />
        ) : (
          <span className="font-mono text-[11px] text-zinc-600">—</span>
        )}
      </div>

      {/* Status */}
      <div className="w-16 shrink-0 text-right pr-4 text-[12px]">
        {isSuccess ? (
          <span className="text-emerald-400">✓ Pass</span>
        ) : isFailed ? (
          <span className="text-red-400">✗ Fail</span>
        ) : isPending ? (
          <span className="text-zinc-600">…</span>
        ) : null}
      </div>

      {/* Logs */}
      <div className="w-10 shrink-0 flex items-center justify-center">
        {hasLogs ? <LogsPopover logs={result.logs!} rowIndex={index} /> : null}
      </div>
    </div>
  );
}
