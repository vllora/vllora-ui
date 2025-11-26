import { useState, useMemo } from "react";
import { Maximize2, X, Copy, Check } from "lucide-react";
import type { Message, MessageContentPart } from "@/hooks/useExperiment";
import { normalizeContentToString } from "@/hooks/useExperiment";
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
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";

interface MessageEditorProps {
  message: Message;
  index: number;
  updateMessage: (index: number, content: string | MessageContentPart[]) => void;
  updateMessageRole: (index: number, role: Message["role"]) => void;
  deleteMessage: (index: number) => void;
  isHighlighted?: boolean;
}

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

export function MessageEditor({
  message,
  index,
  updateMessage,
  updateMessageRole,
  deleteMessage,
  isHighlighted,
}: MessageEditorProps) {
  // Determine initial editor mode based on content
  const initialMode = useMemo((): EditorMode => {
    if (isStructuredContent(message.content)) return "structured";
    return "plain";
  }, []);

  const [editorMode, setEditorMode] = useState<EditorMode>(initialMode);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Keep track if content is structured (for display purposes)
  const isStructured = useMemo(
    () => isStructuredContent(message.content),
    [message.content]
  );

  // Normalize content to string for editing
  const contentAsString = normalizeContentToString(message.content);

  // Handle editor mode change
  // Only convert content when switching TO structured from empty/plain text
  // Never auto-convert FROM structured to avoid losing data (images, etc.)
  const handleModeChange = (newMode: EditorMode) => {
    if (newMode === "structured" && !isStructured) {
      // Switch to structured: only convert if content is plain text
      const currentContent = contentAsString.trim();
      if (currentContent) {
        // Wrap existing text in structured format
        updateMessage(
          index,
          JSON.stringify([{ type: "text", text: currentContent }], null, 2)
        );
      } else {
        updateMessage(index, STRUCTURED_CONTENT_TEMPLATE);
      }
    }
    // Don't auto-convert when switching FROM structured - user keeps JSON as-is
    setEditorMode(newMode);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(contentAsString);
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
            {/* Editor mode selector */}
            <SegmentedControl
              options={[
                { value: "plain", label: "Plain" },
                { value: "markdown", label: "Markdown" },
                { value: "structured", label: "Structured" },
              ]}
              value={editorMode}
              onChange={(val) => handleModeChange(val as EditorMode)}
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
        {editorMode === "structured" ? (
          <div className="h-[15vh] border border-border rounded overflow-hidden">
            <JsonEditor
              value={contentAsString}
              onChange={(content: string) => updateMessage(index, content)}
              hideValidation
              transparentBackground
              disableStickyScroll
            />
          </div>
        ) : editorMode === "markdown" ? (
          <CodeMirrorEditor
            content={contentAsString}
            onChange={(content: string) => updateMessage(index, content)}
            placeholder="Enter message content... Use {{variable}} for mustache variables"
            minHeight="15vh"
            maxHeight="15vh"
          />
        ) : (
          <textarea
            value={contentAsString}
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
        initialEditorMode={editorMode}
        onApply={(content, newEditorMode, newRole) => {
          updateMessage(index, content);
          if (newRole !== message.role) {
            updateMessageRole(index, newRole);
          }
          setEditorMode(newEditorMode);
        }}
      />
    </>
  );
}
