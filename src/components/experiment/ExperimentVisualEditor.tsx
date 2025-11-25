import { useRef, useState } from "react";
import type { Message, Tool } from "@/hooks/useExperiment";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { MessagesSection } from "./MessagesSection";
import { ToolsSection } from "./ToolsSection";

interface ExperimentVisualEditorProps {
  messages: Message[];
  tools: Tool[];
  addMessage: () => void;
  updateMessage: (index: number, content: string) => void;
  deleteMessage: (index: number) => void;
  onToolsChange: (tools: Tool[]) => void;
}

export function ExperimentVisualEditor({
  messages,
  tools,
  addMessage,
  updateMessage,
  deleteMessage,
  onToolsChange,
}: ExperimentVisualEditorProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const toolsEndRef = useRef<HTMLDivElement>(null);
  const [highlightedMessageIndex, setHighlightedMessageIndex] = useState<number | null>(null);
  const [highlightedToolIndex, setHighlightedToolIndex] = useState<number | null>(null);

  const handleAddMessage = () => {
    addMessage();
    const newIndex = messages.length; // The new message will be at this index
    // Scroll to the new message after it's rendered
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setHighlightedMessageIndex(newIndex);
      // Clear highlight after animation
      setTimeout(() => setHighlightedMessageIndex(null), 1000);
    }, 100);
  };

  const handleAddTool = () => {
    const newTool: Tool = {
      type: "function",
      function: {
        name: "",
        description: "",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    };
    onToolsChange([...tools, newTool]);
    const newIndex = tools.length; // The new tool will be at this index
    // Scroll to the new tool after it's rendered
    setTimeout(() => {
      toolsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setHighlightedToolIndex(newIndex);
      // Clear highlight after animation
      setTimeout(() => setHighlightedToolIndex(null), 1000);
    }, 100);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sticky Toolbar */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-2 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddMessage}
          className="gap-1"
        >
          <Plus className="w-4 h-4" />
          Add Message
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddTool}
          className="gap-1"
        >
          <Plus className="w-4 h-4" />
          Add Tool
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Messages Section */}
        <MessagesSection
          messages={messages}
          updateMessage={updateMessage}
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
    </div>
  );
}
