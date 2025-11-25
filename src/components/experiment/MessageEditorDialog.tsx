import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { Message } from "@/hooks/useExperiment";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { RoleSelector } from "./RoleSelector";
import { MarkdownViewer } from "@/components/chat/traces/TraceRow/span-info/DetailView/markdown-viewer";

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
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraftContent(message.content);
      setDraftRole(message.role);
      setUseMarkdown(initialUseMarkdown);
      setShowPreview(false);
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
          <div className="flex items-center justify-between pr-4">
            <DialogTitle className="flex items-center gap-3">
              <RoleSelector
                value={draftRole}
                onChange={setDraftRole}
              />
            </DialogTitle>
            <div className="flex items-center gap-2">
              <SegmentedControl
                options={[
                  { value: "plain", label: "Plain" },
                  { value: "markdown", label: "Markdown" },
                ]}
                value={useMarkdown ? "markdown" : "plain"}
                onChange={(val) => {
                  setUseMarkdown(val === "markdown");
                  if (val === "plain") setShowPreview(false);
                }}
              />
              {useMarkdown && (
                <Button
                  variant={showPreview ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                  className="gap-1"
                >
                  {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showPreview ? "Edit" : "Preview"}
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden p-4">
          {useMarkdown ? (
            showPreview ? (
              <div className="h-full overflow-auto prose prose-sm dark:prose-invert max-w-none">
                <MarkdownViewer message={draftContent} />
              </div>
            ) : (
              <div className="h-full flex flex-col">
                <CodeMirrorEditor
                  content={draftContent}
                  onChange={setDraftContent}
                  placeholder="Enter message content... Use {{variable}} for mustache variables"
                  showToolbar={true}
                  fullHeight={true}
                />
              </div>
            )
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
