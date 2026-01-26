/**
 * Utility functions for ConversationThreadCell
 *
 * Handles message extraction and formatting for conversation display.
 */

import { DataInfo } from "@/types/dataset-types";

export interface MessagePreview {
  role: string;
  content: string;
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
        return JSON.stringify(item);
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
        const content = (msg as Record<string, unknown>).content || msg.toolCalls;
        if (role && content !== undefined) {
          let contentExtracted = extractContent(content);
          
          messages.push({
            role: String(role),
            content: contentExtracted,
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
        const content = msgObj.content || msgObj.tool_calls || msg;
       
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
export function getRoleLabel(role: string): string {
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
export function getRoleStyle(role: string): { badgeClass: string; contentClass: string } {
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
export function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
