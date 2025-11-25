import { useState, useEffect } from "react";
import type { Message } from "@/hooks/useExperiment";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { RoleSelector } from "./RoleSelector";

interface MessageEditorDialogProps {
  message: Message;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (content: string, useMarkdown: boolean, role: Message["role"]) => void;
  initialUseMarkdown: boolean;
}

export function MessageEditorDialog({
  message,
  isOpen,
  onOpenChange,
  onApply,
  initialUseMarkdown,
}: MessageEditorDialogProps) {
  const [draftContent, setDraftContent] = useState(message.content);
  const [draftRole, setDraftRole] = useState<Message["role"]>(message.role);
  const [useMarkdown, setUseMarkdown] = useState(initialUseMarkdown);

  useEffect(() => {
    if (isOpen) {
      setDraftContent(message.content);
      setDraftRole(message.role);
      setUseMarkdown(initialUseMarkdown);
    }
  }, [isOpen, message.content, message.role, initialUseMarkdown]);

  const handleApply = () => {
    onApply(draftContent, useMarkdown, draftRole);
    onOpenChange(false);
  };

  const handleDiscard = () => {
    onOpenChange(false);
  };

  const hasChanges = draftContent !== message.content || useMarkdown !== initialUseMarkdown || draftRole !== message.role;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[80vw] h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3">
              <RoleSelector
                value={draftRole}
                onChange={setDraftRole}
              />
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

        <div className="flex-1 overflow-hidden p-4">
          {useMarkdown ? (
            <div className="h-full flex flex-col">
              <CodeMirrorEditor
                content={draftContent}
                onChange={setDraftContent}
                placeholder="Enter message content... Use {{variable}} for mustache variables"
                showToolbar={true}
                fullHeight={true}
              />
            </div>
          ) : (
            <textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              placeholder="Enter message content... Use {{variable}} for mustache variables"
              className="w-full h-full bg-background border border-border rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:border-muted-foreground/50 transition-colors font-mono"
              autoFocus
            />
          )}
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
