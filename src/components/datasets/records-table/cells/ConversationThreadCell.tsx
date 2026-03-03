/**
 * ConversationThreadCell
 *
 * Displays conversation thread preview.
 * - Default mode: role badges (SYS/USR/AST) with single-line truncation
 * - Compact mode: content-first cards without badges, 2-line user message, dimmed assistant preview
 */

import { cn } from "@/lib/utils";
import {
  extractMessages,
  getRoleLabel,
  getRoleStyle,
  cleanText,
} from "./ConversationThreadCell.utilities";

// Re-export for external consumers
export { extractMessages } from "./ConversationThreadCell.utilities";

interface ConversationThreadCellProps {
  data: unknown;
  className?: string;
  /** If this record is a variant, show the source record ID */
  sourceRecordId?: string;
  /** Hide the system message (when shown at topic group level instead) */
  hideSystemMessage?: boolean;
  /** Compact mode: content-first, no role badges, 2-line message preview */
  compact?: boolean;
}

export function ConversationThreadCell({ data, className, sourceRecordId, hideSystemMessage, compact }: ConversationThreadCellProps) {
  let messages = extractMessages(data);
  if (hideSystemMessage || compact) {
    messages = messages.filter(m => m.role.toLowerCase() !== 'system');
  }

  if (messages.length === 0) {
    return (
      <div className={cn("flex-1 min-w-0", className)}>
        <span className="text-xs text-muted-foreground italic">No messages</span>
      </div>
    );
  }

  // ─── Compact mode: content-first data card ─────────────────────────────────
  if (compact) {
    // Find first user message and first assistant message
    const userMsg = messages.find(m => {
      const r = m.role.toLowerCase();
      return r === 'user' || r === 'human';
    });
    const assistantMsg = messages.find(m => {
      const r = m.role.toLowerCase();
      return r === 'assistant' || r === 'ai' || r === 'model';
    });

    const userContent = userMsg ? cleanText(userMsg.content) : cleanText(messages[0].content);
    const assistantContent = assistantMsg ? cleanText(assistantMsg.content) : null;

    return (
      <div className={cn("flex-1 min-w-0 flex flex-col gap-0.5", className)}>
        {/* User message: 2-line clamp for more visible content */}
        <span className="text-[11px] text-foreground line-clamp-2 leading-relaxed">
          {userContent}
        </span>
        {/* Assistant response preview (SFT records) */}
        {assistantContent && (
          <span className="text-[10px] text-muted-foreground/60 truncate min-w-0 leading-relaxed">
            → {assistantContent}
          </span>
        )}
        {/* Variant indicator */}
        {sourceRecordId && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('vllora_highlight_record', {
                detail: { recordId: sourceRecordId }
              }));
            }}
            className="text-[10px] text-violet-400/80 hover:text-violet-300 hover:underline cursor-pointer text-left"
          >
            ↳ variant of {sourceRecordId.slice(0, 8)}...
          </button>
        )}
      </div>
    );
  }

  // ─── Default mode: role badges with single-line truncation ─────────────────
  const displayMessagesCount = Math.min(messages.length, 2);
  const displayMessages = messages.slice(0, displayMessagesCount);

  return (
    <div className={cn("flex-1 min-w-0 flex flex-col gap-1", className)}>
      {displayMessages.map((msg, idx) => {
        const roleLabel = getRoleLabel(msg.role);
        const { badgeClass, contentClass } = getRoleStyle(msg.role);
        const cleanedContent = cleanText(msg.content);

        return (
          <div key={idx} className="flex items-center gap-2 text-[11px] min-w-0">
            <span className={cn(
              "shrink-0 w-8 text-center rounded text-[9px] font-semibold uppercase",
              badgeClass
            )}>
              {roleLabel}
            </span>
            <span className={cn("truncate min-w-0", contentClass)}>
              {cleanedContent}
            </span>
          </div>
        );
      })}
      {/* Variant indicator or message count */}
      {sourceRecordId ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            // Emit event to scroll to and highlight the source record
            window.dispatchEvent(new CustomEvent('vllora_highlight_record', {
              detail: { recordId: sourceRecordId }
            }));
          }}
          className="text-[10px] text-violet-400/80 pl-10 hover:text-violet-300 hover:underline cursor-pointer text-left"
        >
          ↳ variant of {sourceRecordId.slice(0, 8)}...
        </button>
      ) : messages.length > displayMessagesCount ? (
        <span className="text-[10px] text-zinc-500 pl-10">
          +{messages.length - displayMessagesCount} more...
        </span>
      ) : null}
    </div>
  );
}
