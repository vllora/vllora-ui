/**
 * ConversationExpandedDetail
 *
 * Expanded inline detail view for a conversation row.
 * Shows user message, assistant response (with markdown),
 * and eval score breakdown.
 *
 * System prompt is NOT shown here — it's already displayed in the
 * topic-level banner above the records table.
 *
 * Role badges: User = blue, Assistant = emerald.
 */

import { cn } from "@/lib/utils";
import { MarkdownViewer } from "@/components/chat/traces/TraceRow/span-info/DetailView/markdown-viewer";
import {
  TableRow,
  TableCell,
} from "@/components/ui/table";
import type { ConversationRow, ConversationTableMode } from "./types";

interface ConversationExpandedDetailProps {
  readonly row: ConversationRow;
  readonly mode: ConversationTableMode;
  /** @deprecated No longer used — system prompt shown in topic banner instead */
  readonly commonSystem?: string;
  /** Number of visible columns for colSpan */
  readonly colSpan: number;
}

const ROLE_BADGE =
  "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border mb-1.5";

export function ConversationExpandedDetail({
  row,
  mode,
  colSpan,
}: ConversationExpandedDetailProps) {
  return (
    <TableRow className="bg-muted/10 hover:bg-muted/10">
      <TableCell colSpan={colSpan} className="px-6 py-4">
        <div className="space-y-3 max-w-3xl">
          {/* User message */}
          <div>
            <span className={cn(ROLE_BADGE, "bg-blue-500/10 text-blue-500 border-blue-500/20")}>
              User
            </span>
            <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed mt-1">
              {row.user}
            </p>
          </div>

          {/* Assistant response (markdown for code blocks) */}
          <div>
            <span className={cn(ROLE_BADGE, "bg-emerald-500/10 text-emerald-500 border-emerald-500/20")}>
              Assistant
            </span>
            <div className="text-xs text-foreground/80 leading-relaxed mt-1 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_p]:text-xs [&_li]:text-xs [&_pre]:text-[11px]">
              <MarkdownViewer message={row.assistant} />
            </div>
          </div>

          {/* Eval scores — read-only mode only */}
          {mode === "jsonl-read-only" &&
            row.evalScores &&
            Object.keys(row.evalScores).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/30">
                <span className="text-[10px] text-muted-foreground font-medium mr-1">Eval:</span>
                {Object.entries(row.evalScores).map(([key, val]) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-muted/40 text-muted-foreground border border-border/30"
                  >
                    {key}: {typeof val === "number" ? val.toFixed(2) : String(val)}
                  </span>
                ))}
              </div>
            )}
        </div>
      </TableCell>
    </TableRow>
  );
}
