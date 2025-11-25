import { useState } from "react";
import { Maximize2, X } from "lucide-react";
import type { Message } from "@/hooks/useExperiment";
import Editor from "@monaco-editor/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MessageEditorDialog } from "./MessageEditorDialog";

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
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const roleColor =
    message.role === "system"
      ? "text-purple-500"
      : message.role === "user"
      ? "text-blue-500"
      : "text-green-500";

  return (
    <>
      <div
        className={`border border-border rounded-lg p-3 bg-card transition-all ${
          isHighlighted ? "animate-highlight-flash" : ""
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          {/* Left side - Role label */}
          <span className={`text-xs font-semibold uppercase ${roleColor}`}>
            {message.role}
          </span>

          {/* Right side - Action buttons */}
          <div className="flex items-center gap-2">
            {/* Markdown toggle - segmented control style */}
            <div className="flex items-center bg-muted rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setUseMarkdown(false)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  !useMarkdown
                    ? "bg-background shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Plain
              </button>
              <button
                type="button"
                onClick={() => setUseMarkdown(true)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  useMarkdown
                    ? "bg-background shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Markdown
              </button>
            </div>

            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1">
                {/* Expand to dialog */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setIsDialogOpen(true)}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Expand editor</TooltipContent>
                </Tooltip>

                {/* Delete button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => deleteMessage(index)}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Delete message</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
        </div>

        {/* Inline editor - compact view */}
        {useMarkdown ? (
          <div className="border border-border rounded overflow-hidden">
            <Editor
              height="150px"
              language="markdown"
              value={message.content}
              onChange={(value) => updateMessage(index, value || "")}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "off",
                wordWrap: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 8, bottom: 8 },
                renderLineHighlight: "none",
                folding: false,
                lineDecorationsWidth: 8,
                lineNumbersMinChars: 0,
              }}
            />
          </div>
        ) : (
          <textarea
            value={message.content}
            onChange={(e) => updateMessage(index, e.target.value)}
            placeholder="Enter message content... Use {{variable}} for mustache variables"
            className="w-full min-h-[80px] max-h-[150px] bg-background border border-border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-muted-foreground/50 transition-colors overflow-auto"
            rows={3}
          />
        )}
      </div>

      {/* Expanded editor dialog */}
      <MessageEditorDialog
        message={message}
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        initialUseMarkdown={useMarkdown}
        onApply={(content, newUseMarkdown) => {
          updateMessage(index, content);
          setUseMarkdown(newUseMarkdown);
        }}
      />
    </>
  );
}
