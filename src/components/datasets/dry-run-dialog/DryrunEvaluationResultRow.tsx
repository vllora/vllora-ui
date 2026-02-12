/**
 * DryrunEvaluationResultRow
 *
 * Displays a single evaluation result row with status indicator, score, and message.
 * Shows logs in a popover when available.
 */

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, ChevronRight, ChevronDown, Copy, Check } from "lucide-react";
import type { FlatEvaluationResult } from "@/services/finetune-api";
import { getScoreColorClass, formatScore } from "@/utils/parse-score-breakdown";
import { LogsPopover } from "./LogsPopover";

type EvaluationResult = FlatEvaluationResult;

interface DryrunEvaluationResultRowProps {
  result: EvaluationResult;
  index: number;
  isExpandable?: boolean;
  isExpanded?: boolean;
  isHighlighted?: boolean;
  onClick?: () => void;
  onRecordIdClick?: (recordId: string) => void;
}

/**
 * Highlights keywords in error/reason text with styled badges
 */
function HighlightedText({ text }: { text: string }) {
  // Keywords to highlight (common error patterns)
  const keywords = [
    "model",
    "model_params",
    "completion_params",
    "prompt_v2",
    "required",
    "error",
    "failed",
    "timeout",
    "invalid",
  ];

  // Split text by keywords and highlight them
  const parts: Array<{ text: string; isKeyword: boolean }> = [];
  let remaining = text;

  while (remaining.length > 0) {
    let foundKeyword = false;
    for (const keyword of keywords) {
      const lowerRemaining = remaining.toLowerCase();
      const index = lowerRemaining.indexOf(keyword.toLowerCase());
      if (index !== -1) {
        // Add text before keyword
        if (index > 0) {
          parts.push({ text: remaining.slice(0, index), isKeyword: false });
        }
        // Add keyword
        parts.push({
          text: remaining.slice(index, index + keyword.length),
          isKeyword: true,
        });
        remaining = remaining.slice(index + keyword.length);
        foundKeyword = true;
        break;
      }
    }
    if (!foundKeyword) {
      parts.push({ text: remaining, isKeyword: false });
      break;
    }
  }

  return (
    <span>
      {parts.map((part, i) =>
        part.isKeyword ? (
          <code
            key={i}
            className="mx-0.5 px-1 py-0.5 rounded bg-red-500/15 text-red-400 font-mono text-[11px]"
          >
            {part.text}
          </code>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}

function RecordIdCell({ recordId, onNavigate }: { recordId: string; onNavigate: (e: React.MouseEvent) => void }) {
  const [copied, setCopied] = useState(false);
  const shortId = recordId.length > 8 ? recordId.slice(0, 8) : recordId;

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(recordId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [recordId]);

  return (
    <div className="w-24 shrink-0 py-1 pr-2 group/id">
      <div className="flex items-center gap-0.5">
        <button
          className="font-mono text-[11px] text-zinc-400 hover:text-blue-400 transition-colors truncate"
          onClick={onNavigate}
          title={`Go to record ${recordId}`}
        >
          {shortId}
        </button>
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover/id:opacity-100 p-0.5 text-zinc-600 hover:text-zinc-300 transition-all"
          title="Copy full ID"
        >
          {copied ? (
            <Check className="h-2.5 w-2.5 text-emerald-400" />
          ) : (
            <Copy className="h-2.5 w-2.5" />
          )}
        </button>
      </div>
    </div>
  );
}

export function DryrunEvaluationResultRow({
  result,
  index,
  isExpandable,
  isExpanded,
  isHighlighted,
  onClick,
  onRecordIdClick,
}: DryrunEvaluationResultRowProps) {
  const isSuccess = result.status === "completed" && !result.error_message;
  const isFailed = result.status === "failed" || !!result.error_message;
  const isPending = result.status === "pending" || result.status === "running";
  const hasLogs = result.logs && result.logs.length > 0;

  // Show appropriate message based on status
  const message = isPending
    ? "Waiting for evaluation..."
    : result.error_message || result.reason || "Evaluation completed";

  return (
    <div
      className={cn(
        "flex items-center border-t border-border/50 first:border-t-0 rounded-sm",
        isExpandable ? "cursor-pointer hover:bg-muted/30" : "h-full",
        isHighlighted && "animate-record-highlight"
      )}
      style={{ minHeight: 32 }}
      onClick={onClick}
    >
      {/* Expand chevron / empty column */}
      <div className="w-6 shrink-0 flex items-center justify-center">
        {isExpandable ? (
          isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )
        ) : null}
      </div>

      {/* Row index column */}
      <div className="w-12 shrink-0 py-1 pr-2 font-mono text-xs">
        {index + 1}
      </div>

      {/* Record ID column — only shown when onRecordIdClick is provided */}
      {onRecordIdClick && (
        <RecordIdCell
          recordId={result.dataset_row_id}
          onNavigate={(e) => {
            e.stopPropagation();
            onRecordIdClick(result.dataset_row_id);
          }}
        />
      )}

      {/* Score column */}
      <div className="w-16 shrink-0 py-1 pr-2">
        {result.score != null && isSuccess ? (
          <span className={cn("font-mono text-xs", getScoreColorClass(result.score))}>
            {formatScore(result.score)}
          </span>
        ) : isPending ? (
          <div className="h-3 w-3 rounded-full border-2 border-muted-foreground/50 border-t-muted-foreground animate-spin" />
        ) : (
          <span className="font-mono text-xs text-muted-foreground">-</span>
        )}
      </div>

      {/* Status column */}
      <div className="w-16 shrink-0 py-1 pr-2">
        {isSuccess ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        ) : isFailed ? (
          <AlertCircle className="h-3.5 w-3.5 text-red-500" />
        ) : (
          <span className="text-xs text-muted-foreground">...</span>
        )}
      </div>

      {/* Message/Reasoning column */}
      <div className="flex-1 py-1 pr-2 text-xs text-muted-foreground truncate min-w-0">
        {isFailed ? <HighlightedText text={message} /> : message}
      </div>

      {/* Logs button column */}
      <div className="w-12 shrink-0 flex items-center justify-center">
        {hasLogs && <LogsPopover logs={result.logs!} rowIndex={index} />}
      </div>
    </div>
  );
}
