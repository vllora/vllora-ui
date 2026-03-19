/**
 * DryrunEvaluationResultRow
 *
 * Evaluation result row with expandable reason/criteria breakdown.
 * Columns: # | Input | Topic | Score | Reason/Status | Logs
 */

import { cn } from "@/lib/utils";
import type { FlatEvaluationResult } from "@/services/finetune-api";
import { getScoreColorClass, formatScore, parseScoreBreakdown } from "@/utils/parse-score-breakdown";
import { LogsPopover } from "./LogsPopover";
import { ChevronRight } from "lucide-react";

interface DryrunEvaluationResultRowProps {
  readonly result: FlatEvaluationResult;
  readonly index: number;
  readonly isHighlighted?: boolean;
  readonly onClick?: () => void;
  /** Navigate to this record in the records table */
  readonly onNavigateToRecord?: (recordId: string, result: FlatEvaluationResult) => void;
  /** Whether to show the epoch column (hidden when all rows share the same epoch) */
  readonly showEpoch?: boolean;
  /** Whether this row is currently expanded */
  readonly isExpanded?: boolean;
  /** Whether all results have the same status (hides redundant status column) */
  readonly allSameStatus?: boolean;
}

/** Render a trend value as a colored arrow + delta string */
function renderTrend(trend: number): React.ReactNode {
  if (trend > 0.005) {
    return <span className="text-emerald-400">↑ +{trend.toFixed(2)}</span>;
  }
  if (trend < -0.005) {
    return <span className="text-red-400">↓ {trend.toFixed(2)}</span>;
  }
  return <span className="text-zinc-500">→ 0.00</span>;
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

/** Extract topic from row metadata */
function getTopicName(row?: Record<string, unknown>): string | null {
  if (!row) return null;
  const topic = row.topic ?? row.topic_name ?? row.topicName;
  return typeof topic === "string" ? topic : null;
}

export function DryrunEvaluationResultRow({
  result,
  index,
  isHighlighted,
  onClick,
  onNavigateToRecord,
  showEpoch,
  isExpanded,
  allSameStatus,
}: DryrunEvaluationResultRowProps) {
  const isSuccess = result.status === "completed" && !result.error_message;
  const isFailed = result.status === "failed" || !!result.error_message;
  const isPending = result.status === "pending" || result.status === "running";
  const hasLogs = result.logs && result.logs.length > 0;
  const inputText = getInputText(result.row);
  const topicName = getTopicName(result.row as Record<string, unknown> | undefined);
  const reason = result.reason;

  // Truncated reason snippet for the table row (replaces Status when all same)
  const reasonSnippet = reason
    ? reason.replace(/^\s*\[[^\]]+\]\s*/, "").slice(0, 60)
    : null;

  return (
    <div>
      {/* Main row */}
      <div
        className={cn(
          "group flex items-center border-b border-zinc-800/40 h-[38px]",
          onClick && "cursor-pointer hover:bg-zinc-800/20",
          isHighlighted && "animate-record-highlight",
          isExpanded && "bg-zinc-800/15 border-b-0",
        )}
        onClick={onClick}
      >
        {/* Expand indicator */}
        <div className="w-5 shrink-0 flex items-center justify-center">
          {reason && (
            <ChevronRight className={cn(
              "w-3 h-3 text-zinc-600 transition-transform",
              isExpanded && "rotate-90 text-zinc-400",
            )} />
          )}
        </div>

        {/* # */}
        <div className="w-8 shrink-0 font-mono text-[11px] text-zinc-600 tabular-nums">
          {index + 1}
        </div>

        {/* Epoch (only when multiple epochs exist) */}
        {showEpoch && result.epoch != null && (
          <div className="w-[50px] shrink-0 text-center font-mono text-[11px] text-zinc-400 tabular-nums">
            E{result.epoch}
          </div>
        )}

        {/* Input — clickable link to navigate to record */}
        {onNavigateToRecord ? (
          <button
            type="button"
            className="flex-1 min-w-0 pr-4 text-[12px] text-zinc-300 truncate text-left hover:underline hover:text-zinc-100 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToRecord(result.dataset_row_id, result);
            }}
            title="View in records table"
          >
            {inputText}
          </button>
        ) : (
          <div className="flex-1 min-w-0 pr-4 text-[12px] text-zinc-300 truncate">
            {inputText}
          </div>
        )}

        {/* Topic */}
        {topicName && (
          <div className="w-[120px] shrink-0 pr-2">
            <span className="text-[10px] text-zinc-500 bg-zinc-800/50 rounded px-1.5 py-0.5 truncate block max-w-full" title={topicName}>
              {topicName}
            </span>
          </div>
        )}

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

        {/* Trend (only for finetune per-row results) */}
        {result.trend != null && (
          <div className="w-[50px] shrink-0 text-center font-mono text-[11px] tabular-nums">
            {renderTrend(result.trend)}
          </div>
        )}

        {/* Status or Reason snippet */}
        <div className="w-[140px] shrink-0 pr-2">
          {allSameStatus && reasonSnippet ? (
            <span className="text-[10px] text-zinc-500 truncate block" title={reason}>
              {reasonSnippet}…
            </span>
          ) : isSuccess ? (
            <span className="text-[12px] text-emerald-400">✓ Pass</span>
          ) : isFailed ? (
            <span className="text-[12px] text-red-400">✗ Fail</span>
          ) : isPending ? (
            <span className="text-[12px] text-zinc-600">…</span>
          ) : null}
        </div>

        {/* Logs */}
        <div className="w-10 shrink-0 flex items-center justify-center">
          {hasLogs ? <LogsPopover logs={result.logs!} rowIndex={index} /> : null}
        </div>
      </div>

      {/* Expanded content: reason + criteria breakdown */}
      {isExpanded && reason && (
        <ExpandedReasonPanel reason={reason} />
      )}
    </div>
  );
}

/** Expanded panel showing criteria breakdown + full reason text */
function ExpandedReasonPanel({ reason }: { readonly reason: string }) {
  const breakdown = parseScoreBreakdown(reason);

  return (
    <div className="bg-zinc-900/40 border-b border-zinc-800/40 px-8 py-3 space-y-2">
      {/* Criteria breakdown bars */}
      {breakdown.hasBreakdown && Object.keys(breakdown.criteria).length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1.5">
          {Object.entries(breakdown.criteria).map(([name, score]) => (
            <div key={name} className="flex items-center gap-2 min-w-[140px]">
              <span className="text-[10px] text-zinc-500 w-20 truncate" title={name}>
                {name}
              </span>
              <div className="w-16 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    score >= 0.8 ? "bg-emerald-500/60" : score >= 0.6 ? "bg-amber-500/60" : "bg-red-500/60",
                  )}
                  style={{ width: `${score * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-zinc-400 tabular-nums w-8">
                {score.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Reasoning text — use parsed reasoning if breakdown exists, raw reason otherwise */}
      <p className="text-[11px] leading-relaxed text-zinc-400 whitespace-pre-wrap">
        {breakdown.hasBreakdown ? breakdown.reasoning : reason}
      </p>
    </div>
  );
}
