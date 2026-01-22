/**
 * ConversationThreadCell
 *
 * Displays conversation thread preview with SYS/USR/AST message labels.
 */

import { cn } from "@/lib/utils";
import { DataInfo } from "@/types/dataset-types";

interface MessagePreview {
  role: string;
  content: string;
}

interface ConversationThreadCellProps {
  data: unknown;
  className?: string;
}

/**
 * Extract text content from various message content formats
 */
function extractContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    // Handle content arrays (e.g., [{type: 'text', text: '...'}])
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.text) return item.text;
        if (item?.content) return extractContent(item.content);
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }
  if (content && typeof content === "object") {
    const obj = content as Record<string, unknown>;
    if (obj.text) return String(obj.text);
    if (obj.content) return extractContent(obj.content);
  }
  return "";
}

/**
 * Extract messages from DataInfo structure
 */
export function extractMessages(data: unknown): MessagePreview[] {
  if (!data || typeof data !== "object") return [];

  const dataInfo = data as DataInfo;
  const messages: MessagePreview[] = [];

  // Input messages (system, user)
  if (dataInfo?.input?.messages && Array.isArray(dataInfo.input.messages)) {
    for (const msg of dataInfo.input.messages) {
      if (msg && typeof msg === "object") {
        const role = (msg as Record<string, unknown>).role;
        const content = (msg as Record<string, unknown>).content;
        if (role && content !== undefined) {
          messages.push({
            role: String(role),
            content: extractContent(content),
          });
        }
      }
    }
  }

  // Output messages (assistant)
  if (dataInfo?.output?.messages) {
    const outputMsgs = Array.isArray(dataInfo.output.messages)
      ? dataInfo.output.messages
      : [dataInfo.output.messages];

    for (const msg of outputMsgs) {
      if (msg && typeof msg === "object") {
        const msgObj = msg as Record<string, unknown>;
        const role = msgObj.role || "assistant";
        const content = msgObj.content ?? msg;
        messages.push({
          role: String(role),
          content: extractContent(content),
        });
      } else if (typeof msg === "string") {
        messages.push({
          role: "assistant",
          content: msg,
        });
      }
    }
  }

  return messages;
}

/**
 * Get role label abbreviation
 */
function getRoleLabel(role: string): string {
  const normalizedRole = role.toLowerCase();
  switch (normalizedRole) {
    case "system":
      return "SYS";
    case "user":
    case "human":
      return "USR";
    case "assistant":
    case "ai":
    case "model":
      return "AST";
    case "tool":
      return "TOOL";
    default:
      return role.slice(0, 3).toUpperCase();
  }
}

/**
 * Get role styling classes (badge style with opacity)
 */
function getRoleStyle(role: string): { badgeClass: string; contentClass: string } {
  const normalizedRole = role.toLowerCase();
  switch (normalizedRole) {
    case "system":
      return {
        badgeClass: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
        contentClass: "text-muted-foreground italic",
      };
    case "user":
    case "human":
      return {
        badgeClass: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
        contentClass: "text-foreground",
      };
    case "assistant":
    case "ai":
    case "model":
      return {
        badgeClass: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
        contentClass: "text-foreground",
      };
    case "tool":
      return {
        badgeClass: "bg-green-500/20 text-green-400 border border-green-500/30",
        contentClass: "text-muted-foreground",
      };
    default:
      return {
        badgeClass: "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30",
        contentClass: "text-muted-foreground",
      };
  }
}

/**
 * Clean text by normalizing whitespace
 */
function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
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

  // Show up to 3 messages (typically system, user, assistant)
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
