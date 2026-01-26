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

  if (messages.length === 0) {
    return (
      <div className={cn("flex-1 min-w-0", className)}>
        <span className="text-xs text-muted-foreground italic">No messages</span>
      </div>
    );
  }

  // Show first 3 messages with "+X more..." at the bottom
  const displayMessages = messages.slice(0, 3);

  return (
    <div className={cn("flex-1 min-w-0 flex flex-col gap-1.5", className)}>
      {displayMessages.map((msg, idx) => {
        const roleLabel = getRoleLabel(msg.role);
        const { badgeClass, contentClass } = getRoleStyle(msg.role);
        const cleanedContent = cleanText(msg.content);

        return (
          <div key={idx} className="flex items-center gap-2.5 text-sm min-w-0">
            <span className={cn(
              "shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide",
              badgeClass
            )}>
              {roleLabel}
            </span>
            <span className={cn("truncate min-w-0", contentClass)}>
              "{cleanedContent}"
            </span>
          </div>
        );
      })}
      {messages.length > 3 && (
        <span className="text-xs text-muted-foreground/60 pl-12">
          +{messages.length - 3} more...
        </span>
      )}
    </div>
  );
}
