import type { RefObject } from "react";
import type { Message } from "@/hooks/useExperiment";
import { MessageEditor } from "./MessageEditor";

interface MessagesSectionProps {
  messages: Message[];
  updateMessage: (index: number, content: string) => void;
  updateMessageRole: (index: number, role: Message["role"]) => void;
  deleteMessage: (index: number) => void;
  highlightedIndex?: number | null;
  lastMessageRef?: RefObject<HTMLDivElement | null>;
}

export function MessagesSection({
  messages,
  updateMessage,
  updateMessageRole,
  deleteMessage,
  highlightedIndex,
  lastMessageRef,
}: MessagesSectionProps) {

  console.log('==== messages', messages)
  // Extract mustache variables from all messages
  const extractedVariables = Array.from(
    new Set(
      messages
        .filter((msg) => typeof msg.content === 'string')
        .flatMap((msg) => msg.content.match(/\{\{(\w+)\}\}/g) || [])
        .map((match) => match.slice(2, -2))
    )
  );

  return (
    <div className="space-y-4">
      {/* Mustache Variables Section */}
      {extractedVariables.length > 0 && (
        <div className="border border-border rounded-lg p-3 bg-muted/30">
          <div className="text-xs font-semibold mb-2 text-muted-foreground">
            Detected Variables (Mustache Syntax)
          </div>
          <div className="space-y-1">
            {extractedVariables.map((variable) => (
              <div
                key={variable}
                className="flex items-center gap-2 text-xs"
              >
                <code className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded font-mono">
                  {`{{${variable}}}`}
                </code>
                <span className="text-muted-foreground">
                  (Define values in Prompt Variables section)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="space-y-2">
        {messages.map((message, index) => {
          const isLast = index === messages.length - 1;
          return (
            <div key={index} ref={isLast ? lastMessageRef : undefined}>
              <MessageEditor
                message={message}
                index={index}
                updateMessage={updateMessage}
                updateMessageRole={updateMessageRole}
                deleteMessage={deleteMessage}
                isHighlighted={highlightedIndex === index}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
