import { useState, useEffect } from "react";
import type { Message } from "@/hooks/useExperiment";
import Editor from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MessageEditorDialogProps {
  message: Message;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (content: string, useMarkdown: boolean) => void;
  initialUseMarkdown: boolean;
}

export function MessageEditorDialog({
  message,
  isOpen,
  onOpenChange,
  onApply,
  initialUseMarkdown,
}: MessageEditorDialogProps) {
  // Local draft state
  const [draftContent, setDraftContent] = useState(message.content);
  const [useMarkdown, setUseMarkdown] = useState(initialUseMarkdown);

  // Reset draft when dialog opens
  useEffect(() => {
    if (isOpen) {
      setDraftContent(message.content);
      setUseMarkdown(initialUseMarkdown);
    }
  }, [isOpen, message.content, initialUseMarkdown]);

  const roleColorClass =
    message.role === "system"
      ? "bg-purple-500/10 text-purple-500"
      : message.role === "user"
        ? "bg-blue-500/10 text-blue-500"
        : "bg-green-500/10 text-green-500";

  const handleApply = () => {
    onApply(draftContent, useMarkdown);
    onOpenChange(false);
  };

  const handleDiscard = () => {
    onOpenChange(false);
  };

  const hasChanges = draftContent !== message.content || useMarkdown !== initialUseMarkdown;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[80vw] h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3">
              <span
                className={`text-sm font-semibold uppercase px-2 py-1 rounded ${roleColorClass}`}
              >
                {message.role}
              </span>
            </DialogTitle>
            <div className="flex items-center bg-muted rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setUseMarkdown(false)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
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
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  useMarkdown
                    ? "bg-background shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Markdown
              </button>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <Editor
            height="100%"
            language={useMarkdown ? "markdown" : "plaintext"}
            value={draftContent}
            onChange={(value) => setDraftContent(value || "")}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: "off",
              wordWrap: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 16, bottom: 16 },
              renderLineHighlight: "none",
              folding: false,
              lineDecorationsWidth: 16,
              lineNumbersMinChars: 0,
            }}
          />
        </div>
        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={handleDiscard}>
            Discard
          </Button>
          <Button size="sm" onClick={handleApply} disabled={!hasChanges}>
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
