import { useState } from "react";
import { Maximize2, X, Copy, Check } from "lucide-react";
import type { Message } from "@/hooks/useExperiment";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { MessageEditorDialog } from "./MessageEditorDialog";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { RoleSelector } from "./RoleSelector";

interface MessageEditorProps {
  message: Message;
  index: number;
  updateMessage: (index: number, content: string) => void;
  updateMessageRole: (index: number, role: Message["role"]) => void;
  deleteMessage: (index: number) => void;
  isHighlighted?: boolean;
}

export function MessageEditor({
  message,
  index,
  updateMessage,
  updateMessageRole,
  deleteMessage,
  isHighlighted,
}: MessageEditorProps) {
  const [useMarkdown, setUseMarkdown] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div
        className={`border border-border rounded-lg p-3 bg-card transition-all ${
          isHighlighted ? "animate-highlight-flash" : ""
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          {/* Left side - Role selector */}
          <RoleSelector
            value={message.role}
            onChange={(role) => updateMessageRole(index, role)}
            size="sm"
          />

          {/* Right side - Action buttons */}
          <div className="flex items-center gap-2">
            {/* Markdown toggle */}
            <SegmentedControl
              options={[
                { value: "plain", label: "Plain" },
                { value: "markdown", label: "Markdown" },
              ]}
              value={useMarkdown ? "markdown" : "plain"}
              onChange={(val) => setUseMarkdown(val === "markdown")}
              size="sm"
            />

            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1">
                {/* Copy button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{copied ? "Copied!" : "Copy content"}</TooltipContent>
                </Tooltip>

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
          <CodeMirrorEditor
            content={message.content}
            onChange={(content: string) => updateMessage(index, content)}
            placeholder="Enter message content... Use {{variable}} for mustache variables"
            minHeight="15vh"
            maxHeight="15vh"
          />
        ) : (
          <textarea
            value={message.content}
            onChange={(e) => updateMessage(index, e.target.value)}
            placeholder="Enter message content... Use {{variable}} for mustache variables"
            className="w-full min-h-[15vh] max-h-[15vh] bg-background border border-border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-muted-foreground/50 transition-colors overflow-auto"
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
        onApply={(content, newUseMarkdown, newRole) => {
          updateMessage(index, content);
          if (newRole !== message.role) {
            updateMessageRole(index, newRole);
          }
          setUseMarkdown(newUseMarkdown);
        }}
      />
    </>
  );
}
