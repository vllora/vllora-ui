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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  /** Whether the table has any trend data (reserves column space for alignment) */
  readonly showTrend?: boolean;
  /** Whether to show the rollout content (model response) column */
  readonly showRolloutContent?: boolean;
  /** Whether to hide the status/reason column (hidden when external expand provides details) */
  readonly hideStatusColumn?: boolean;
}

/** Format a list of scores as "0.94, 0.83" */
function formatScoreList(scores: number[]): string {
  return scores.map(s => s.toFixed(2)).join(", ");
}

/** Render a trend value with a rich tooltip showing the mean calculation with individual scores */
function renderTrend(
  trend: number,
  currentScore?: number,
  prevScores?: number[],
  currentScores?: number[],
): React.ReactNode {
  const prevMean = currentScore != null ? currentScore - trend : undefined;
  const isUp = trend > 0.005;
  const isDown = trend < -0.005;

  const arrow = isUp ? "↑" : isDown ? "↓" : "→";
  const colorClass = isUp ? "text-emerald-400" : isDown ? "text-red-400" : "text-zinc-500";
  const label = isUp ? `+${trend.toFixed(2)}` : isDown ? trend.toFixed(2) : "0.00";

  const hasCandidateDetail = prevScores && prevScores.length > 0 && currentScores && currentScores.length > 0;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(colorClass, "cursor-help")}>{arrow} {label}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[320px] p-0">
          <div className="px-3 py-2 space-y-1.5">
            <div className="text-[10px] font-medium text-zinc-300">Score Change (Δ) Between Evals</div>
            {hasCandidateDetail ? (
              <div className="space-y-1.5 pt-0.5">
                {/* Previous eval breakdown */}
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between gap-4 text-[10px]">
                    <span className="text-zinc-500">Previous eval</span>
                    <span className="font-mono text-zinc-400 text-[9px]">
                      {prevScores.length > 1 ? `candidates: ${formatScoreList(prevScores)}` : formatScoreList(prevScores)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-[10px]">
                    <span className="text-zinc-600 text-[9px] pl-2">
                      mean = ({formatScoreList(prevScores)}) / {prevScores.length}
                    </span>
                    <span className="font-mono text-zinc-300 font-semibold">= {prevMean?.toFixed(3)}</span>
                  </div>
                </div>
                {/* Current eval breakdown */}
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between gap-4 text-[10px]">
                    <span className="text-zinc-500">Current eval</span>
                    <span className="font-mono text-zinc-400 text-[9px]">
                      {currentScores.length > 1 ? `candidates: ${formatScoreList(currentScores)}` : formatScoreList(currentScores)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-[10px]">
                    <span className="text-zinc-600 text-[9px] pl-2">
                      mean = ({formatScoreList(currentScores)}) / {currentScores.length}
                    </span>
                    <span className="font-mono text-zinc-200 font-semibold">= {currentScore?.toFixed(3)}</span>
                  </div>
                </div>
                {/* Delta */}
                <div className="border-t border-zinc-700/50 pt-1 flex items-center justify-between gap-4 text-[10px]">
                  <span className="text-zinc-500">Δ = current − previous</span>
                  <span className={cn("font-mono font-semibold", colorClass)}>
                    {trend >= 0 ? "+" : ""}{trend.toFixed(3)}
                  </span>
                </div>
              </div>
            ) : prevMean != null && currentScore != null ? (
              <div className="space-y-1 pt-0.5">
                <div className="text-[9px] text-zinc-600">Mean score across all response candidates</div>
                <div className="flex items-center justify-between gap-4 text-[10px]">
                  <span className="text-zinc-500">Previous eval (mean)</span>
                  <span className="font-mono text-zinc-300">{prevMean.toFixed(3)}</span>
                </div>
                <div className="flex items-center justify-between gap-4 text-[10px]">
                  <span className="text-zinc-500">Current eval (mean)</span>
                  <span className="font-mono text-zinc-200 font-semibold">{currentScore.toFixed(3)}</span>
                </div>
                <div className="border-t border-zinc-700/50 pt-1 flex items-center justify-between gap-4 text-[10px]">
                  <span className="text-zinc-500">Δ</span>
                  <span className={cn("font-mono font-semibold", colorClass)}>
                    {trend >= 0 ? "+" : ""}{trend.toFixed(3)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-zinc-500">
                Mean score {isUp ? "improved" : isDown ? "decreased" : "unchanged"} by {Math.abs(trend).toFixed(3)}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
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
  showTrend,
  showRolloutContent,
  hideStatusColumn,
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
          {(reason || hideStatusColumn) && (
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
            E{(result.epoch ?? 0) + 1}
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

        {/* Rollout content (model response) */}
        {showRolloutContent && (
          <div className="w-[200px] shrink-0 pr-2">
            {result.rollout_content ? (
              <span
                className="text-[11px] text-zinc-400 truncate block"
                title={result.rollout_content}
              >
                {result.rollout_content.slice(0, 80)}
              </span>
            ) : (
              <span className="text-[11px] text-zinc-600">—</span>
            )}
          </div>
        )}

        {/* Score */}
        <div className="w-16 shrink-0 text-right pr-4">
          {result.score != null && !isPending ? (
            hideStatusColumn ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "font-mono text-[13px] font-semibold tabular-nums cursor-help",
                        isSuccess
                          ? getScoreColorClass(result.score)
                          : "text-zinc-500",
                      )}
                    >
                      {formatScore(result.score)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[10px] bg-zinc-900 border-zinc-700/60">
                    {result.candidateScores
                      ? `Best score among [${result.candidateScores.map(s => s.toFixed(2)).join(", ")}]`
                      : "Best score among response candidates"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
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
            )
          ) : isPending ? (
            <div className="inline-block h-3 w-3 rounded-full border-2 border-zinc-600 border-t-zinc-400 animate-spin" />
          ) : (
            <span className="font-mono text-[11px] text-zinc-600">—</span>
          )}
        </div>

        {/* Trend — always render cell when table has trend column to keep alignment */}
        {showTrend && (
          <div className="w-[60px] shrink-0 text-center font-mono text-[11px] tabular-nums">
            {result.trend != null ? renderTrend(result.trend, result.score, result.trendPrevScores, result.trendCurrentScores) : null}
          </div>
        )}

        {/* Status or Reason snippet (hidden when expanded content provides details) */}
        {!hideStatusColumn && (
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
        )}

        {/* Logs */}
        <div className="w-10 shrink-0 flex items-center justify-center">
          {hasLogs ? <LogsPopover logs={result.logs!} rowIndex={index} /> : null}
        </div>
      </div>

      {/* Expanded content: reason + criteria breakdown (only for non-finetune rows) */}
      {isExpanded && reason && !hideStatusColumn && (
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
