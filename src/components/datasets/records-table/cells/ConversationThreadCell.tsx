/**
 * ConversationThreadCell
 *
 * Displays conversation thread preview with SYS/USR/AST message labels.
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
}

export function ConversationThreadCell({ data, className }: ConversationThreadCellProps) {
  const messages = extractMessages(data);

  const displayMessagesCount = Math.min(messages.length, 2);
  if (messages.length === 0) {
    return (
      <div className={cn("flex-1 min-w-0", className)}>
        <span className="text-xs text-muted-foreground italic">No messages</span>
      </div>
    );
  }

  // Show first 2 messages with "+X more..." at the bottom
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
      {messages.length > displayMessagesCount && (
        <span className="text-[10px] text-zinc-500 pl-10">
          +{messages.length - displayMessagesCount} more...
        </span>
      )}
    </div>
  );
}
