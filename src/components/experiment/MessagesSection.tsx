import { useState, type RefObject } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div>
      <div
        className="flex items-center gap-2 cursor-pointer mb-3 px-3 py-2 -mx-3 rounded-md hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <h3 className="text-sm font-semibold">Messages</h3>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          {messages.length}
        </span>
      </div>

      {isExpanded && (
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
      )}
    </div>
  );
}
