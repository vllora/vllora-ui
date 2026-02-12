/**
 * FormattedThreadPanel
 *
 * Displays a conversation thread with formatted message bubbles for each role.
 * Reuses SingleMessage for rich features like markdown, tool calls, and expand/collapse.
 */

import { useMemo } from "react";
import { SingleMessageRender } from "./SingleMessageRender";
import { DataInfo } from "@/types/dataset-types";

interface FormattedThreadPanelProps {
  data: unknown;
}

interface ExtractedMessage {
  role: string;
  content?: string;
  toolCalls?: unknown[];
  parts?: unknown[];
  tool_call_id?: string;
}

/**
 * Extract messages from DataInfo structure for display
 */
function extractMessagesForPanel(data: unknown): ExtractedMessage[] {
  const dataInfo = data as DataInfo | undefined;
  if (!dataInfo) return [];

  const messages: ExtractedMessage[] = [];

  // Input messages (system, user)
  if (dataInfo.input?.messages && Array.isArray(dataInfo.input.messages)) {
    for (const msg of dataInfo.input.messages) {
      const content = typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.map((c: { text?: string }) => c.text || "").join("")
          : "";
      let toolCalls = msg.tool_calls;
      if (toolCalls && !Array.isArray(toolCalls)) {
        toolCalls = [toolCalls];
      }

      messages.push({
        role: msg.role || "user",
        content,
        toolCalls,
        parts: Array.isArray(msg.content) ? msg.content : undefined,
      });
    }
  }

  // Output messages (assistant) - handle both single object and array
  if (dataInfo.output?.messages) {
    const outputMsgs = Array.isArray(dataInfo.output.messages)
      ? dataInfo.output.messages
      : [dataInfo.output.messages];

    for (const msg of outputMsgs) {
      const content = typeof msg.content === "string"
        ? msg.content
        : typeof msg === "string"
          ? msg
          : "";

      messages.push({
        role: msg.role || "assistant",
        content,
        toolCalls: msg.tool_calls,
        parts: Array.isArray(msg.content) ? msg.content : undefined,
      });
    }
  }

  return messages;
}

export function FormattedThreadPanel({ data }: FormattedThreadPanelProps) {
  const messages = useMemo(() => extractMessagesForPanel(data), [data]);

  if (messages.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic text-center py-8">
        No messages found in this record
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {messages.map((msg, idx) => (
        <SingleMessageRender
          key={idx}
          role={msg.role}
          content={msg.content}
          toolCalls={msg.toolCalls}
          parts={msg.parts}
          tool_call_id={msg.tool_call_id}
        />
      ))}
    </div>
  );
}
