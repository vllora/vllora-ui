import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { Message, MessageContentPart } from "@/hooks/useExperiment";
import { normalizeContentToString } from "@/hooks/useExperiment";
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
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";

type EditorMode = "plain" | "markdown" | "structured";

// Detect if content is structured (array or JSON array string)
function isStructuredContent(content: string | MessageContentPart[]): boolean {
  if (Array.isArray(content)) return true;
  if (typeof content !== "string") return false;
  const trimmed = content.trim();
  if (!trimmed.startsWith("[")) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed);
  } catch {
    return false;
  }
}

// Default template for structured content
const STRUCTURED_CONTENT_TEMPLATE = JSON.stringify(
  [{ type: "text", text: "" }],
  null,
  2
);

interface MessageEditorDialogProps {
  message: Message;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (content: string, editorMode: EditorMode, role: Message["role"]) => void;
  initialEditorMode: EditorMode;
}

export function MessageEditorDialog({
  message,
  isOpen,
  onOpenChange,
  onApply,
  initialEditorMode,
}: MessageEditorDialogProps) {
  // Normalize content to string for editing (arrays become JSON strings)
  const [draftContent, setDraftContent] = useState(() => normalizeContentToString(message.content));
  const [draftRole, setDraftRole] = useState<Message["role"]>(message.role);
  const [editorMode, setEditorMode] = useState<EditorMode>(initialEditorMode);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraftContent(normalizeContentToString(message.content));
      setDraftRole(message.role);
      setEditorMode(initialEditorMode);
      setShowPreview(false);
    }
  }, [isOpen, message.content, message.role, initialEditorMode]);

  // Handle editor mode change
  // Only convert content when switching TO structured from empty/plain text
  // Never auto-convert FROM structured to avoid losing data (images, etc.)
  const handleModeChange = (newMode: EditorMode) => {
    const isCurrentlyStructured = isStructuredContent(draftContent);

    if (newMode === "structured" && !isCurrentlyStructured) {
      // Switch to structured: only convert if content is plain text
      const currentContent = draftContent.trim();
      if (currentContent) {
        // Wrap existing text in structured format
        setDraftContent(
          JSON.stringify([{ type: "text", text: currentContent }], null, 2)
        );
      } else {
        setDraftContent(STRUCTURED_CONTENT_TEMPLATE);
      }
    }
    // Don't auto-convert when switching FROM structured - user keeps JSON as-is

    if (newMode !== "markdown") {
      setShowPreview(false);
    }
    setEditorMode(newMode);
  };

  const handleApply = () => {
    onApply(draftContent, editorMode, draftRole);
    onOpenChange(false);
  };

  const handleDiscard = () => {
    onOpenChange(false);
  };

  const hasChanges = draftContent !== message.content || editorMode !== initialEditorMode || draftRole !== message.role;

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
                  { value: "structured", label: "Structured" },
                ]}
                value={editorMode}
                onChange={(val) => handleModeChange(val as EditorMode)}
              />
              {editorMode === "markdown" && (
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
          {editorMode === "structured" ? (
            <div className="h-full">
              <JsonEditor
                value={draftContent}
                onChange={setDraftContent}
                hideValidation={false}
                transparentBackground
                disableStickyScroll
              />
            </div>
          ) : editorMode === "markdown" ? (
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
