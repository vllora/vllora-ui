import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Message } from "@/hooks/useExperiment";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import { AutoResizeTextarea } from "./AutoResizeTextarea";

interface MessageEditorProps {
  message: Message;
  index: number;
  updateMessage: (index: number, content: string) => void;
  deleteMessage: (index: number) => void;
  isHighlighted?: boolean;
}

export function MessageEditor({
  message,
  index,
  updateMessage,
  deleteMessage,
  isHighlighted,
}: MessageEditorProps) {
  const [useMarkdown, setUseMarkdown] = useState(false);
  const [isMarkdownExpanded, setIsMarkdownExpanded] = useState(false);
  const [isPlainExpanded, setIsPlainExpanded] = useState(false);
  const [needsExpand, setNeedsExpand] = useState(false);

  return (
    <div
      className={`border border-border rounded-lg p-3 bg-card transition-all ${
        isHighlighted ? "animate-highlight-flash" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-semibold uppercase ${
              message.role === "system"
                ? "text-purple-500"
                : message.role === "user"
                ? "text-blue-500"
                : "text-green-500"
            }`}
          >
            {message.role}
          </span>
          <button
            type="button"
            onClick={() => setUseMarkdown(!useMarkdown)}
            className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5"
          >
            {useMarkdown ? "Plain" : "Markdown"}
          </button>
          {useMarkdown ? (
            <button
              type="button"
              onClick={() => setIsMarkdownExpanded(!isMarkdownExpanded)}
              className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5 flex items-center gap-1"
            >
              {isMarkdownExpanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  Expand
                </>
              )}
            </button>
          ) : (
            needsExpand && (
              <button
                type="button"
                onClick={() => setIsPlainExpanded(!isPlainExpanded)}
                className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5 flex items-center gap-1"
              >
                {isPlainExpanded ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Collapse
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Expand
                  </>
                )}
              </button>
            )
          )}
        </div>
        <button
          onClick={() => deleteMessage(index)}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          ✕
        </button>
      </div>

      {useMarkdown ? (
        <div data-color-mode="dark">
          <MDEditor
            value={message.content}
            onChange={(val) => updateMessage(index, val || "")}
            preview="edit"
            height={isMarkdownExpanded ? 400 : 200}
          />
        </div>
      ) : (
        <AutoResizeTextarea
          value={message.content}
          onChange={(e) => updateMessage(index, e.target.value)}
          placeholder="Enter message content... Use {{variable}} for mustache variables"
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring overflow-hidden"
          isExpanded={isPlainExpanded}
          onNeedsExpandChange={setNeedsExpand}
        />
      )}
    </div>
  );
}
