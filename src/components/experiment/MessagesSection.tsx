import type { RefObject } from "react";
import type { Message, MessageContentPart } from "@/hooks/useExperiment";
import { MessageEditor } from "./MessageEditor";

interface MessagesSectionProps {
  messages: Message[];
  updateMessage: (index: number, content: string | MessageContentPart[]) => void;
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
  return (
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
  );
}
