import { useRef, useState, forwardRef, useImperativeHandle } from "react";
import type { Message, Tool } from "@/hooks/useExperiment";
import { MessagesSection } from "./MessagesSection";
import { ToolsSection } from "./ToolsSection";

export interface ExperimentVisualEditorRef {
  scrollToNewMessage: (index: number) => void;
  scrollToNewTool: (index: number) => void;
}

interface ExperimentVisualEditorProps {
  messages: Message[];
  tools: Tool[];
  updateMessage: (index: number, content: string) => void;
  updateMessageRole: (index: number, role: Message["role"]) => void;
  deleteMessage: (index: number) => void;
  onToolsChange: (tools: Tool[]) => void;
}

export const ExperimentVisualEditor = forwardRef<ExperimentVisualEditorRef, ExperimentVisualEditorProps>(
  function ExperimentVisualEditor(
    {
      messages,
      tools,
      updateMessage,
      updateMessageRole,
      deleteMessage,
      onToolsChange,
    },
    ref
  ) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const toolsEndRef = useRef<HTMLDivElement>(null);
    const [highlightedMessageIndex, setHighlightedMessageIndex] = useState<number | null>(null);
    const [highlightedToolIndex, setHighlightedToolIndex] = useState<number | null>(null);

    useImperativeHandle(ref, () => ({
      scrollToNewMessage: (index: number) => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setHighlightedMessageIndex(index);
        setTimeout(() => setHighlightedMessageIndex(null), 1000);
      },
      scrollToNewTool: (index: number) => {
        toolsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setHighlightedToolIndex(index);
        setTimeout(() => setHighlightedToolIndex(null), 1000);
      },
    }));

    return (
      <div className="space-y-4">
        {/* Messages Section */}
        <MessagesSection
          messages={messages}
          updateMessage={updateMessage}
          updateMessageRole={updateMessageRole}
          deleteMessage={deleteMessage}
          highlightedIndex={highlightedMessageIndex}
          lastMessageRef={messagesEndRef}
        />

        {/* Tools Section */}
        <ToolsSection
          tools={tools}
          onToolsChange={onToolsChange}
          highlightedIndex={highlightedToolIndex}
          lastToolRef={toolsEndRef}
        />
      </div>
    );
  }
);
