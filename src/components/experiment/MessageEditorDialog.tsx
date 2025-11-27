import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Eye, EyeOff, Paperclip } from "lucide-react";
import type { Message } from "@/hooks/useExperiment";
import { normalizeContentToString } from "@/hooks/useExperiment";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { RoleSelector } from "./RoleSelector";
import { MarkdownViewer } from "@/components/chat/traces/TraceRow/span-info/DetailView/markdown-viewer";
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";
import {
  type EditorMode,
  isStructuredContent,
  convertContentForModeChange,
  fileToBase64,
  fileToBase64Raw,
  isImageFile,
  isAudioFile,
  getAudioFormat,
  addImageToContent,
  addAudioToContent,
  addFileToContent,
  extractAttachments,
  removeAttachment,
} from "./message-editor-utils";
import { AttachmentPreview } from "./AttachmentPreview";

interface MessageEditorDialogProps {
  message: Message;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (content: string, editorMode: EditorMode, role: Message["role"]) => void;
  initialEditorMode: EditorMode;
  /** When true, allows attaching any file type. When false, only images and audio are allowed. */
  allowAllFiles?: boolean;
}

export function MessageEditorDialog({
  message,
  isOpen,
  onOpenChange,
  onApply,
  initialEditorMode,
  allowAllFiles = false,
}: MessageEditorDialogProps) {
  // Normalize content to string for editing (arrays become JSON strings)
  const [draftContent, setDraftContent] = useState(() => normalizeContentToString(message.content));
  const [draftRole, setDraftRole] = useState<Message["role"]>(message.role);
  const [editorMode, setEditorMode] = useState<EditorMode>(initialEditorMode);
  const [showPreview, setShowPreview] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setDraftContent(normalizeContentToString(message.content));
      setDraftRole(message.role);
      setEditorMode(initialEditorMode);
      setShowPreview(false);
      setIsDragOver(false);
    }
  }, [isOpen, message.content, message.role, initialEditorMode]);

  // Extract attachments for preview
  const attachments = useMemo(
    () => extractAttachments(draftContent),
    [draftContent]
  );

  // Handle removing an attachment
  const handleRemoveAttachment = useCallback(
    (attachmentIndex: number) => {
      const newContent = removeAttachment(draftContent, attachmentIndex);
      setDraftContent(newContent);
      // If content becomes plain text, switch to plain mode
      if (!isStructuredContent(newContent)) {
        setEditorMode("plain");
      }
    },
    [draftContent]
  );

  // Handle file processing (images, audio, and generic files)
  const handleFile = useCallback(
    async (file: File) => {
      try {
        let newContent: string;
        if (isImageFile(file)) {
          // Images use data URL format
          const base64Url = await fileToBase64(file);
          newContent = addImageToContent(draftContent, base64Url);
        } else if (isAudioFile(file)) {
          // Audio uses raw base64 with format
          const base64Data = await fileToBase64Raw(file);
          const format = getAudioFormat(file);
          newContent = addAudioToContent(draftContent, base64Data, format);
        } else if (allowAllFiles) {
          // Generic files use raw base64 with filename (only when enabled)
          const base64Data = await fileToBase64Raw(file);
          newContent = addFileToContent(draftContent, base64Data, file.name);
        } else {
          // Generic files not allowed
          console.warn("File type not supported. Only images and audio files are allowed.");
          return;
        }
        setDraftContent(newContent);
        setEditorMode("structured");
      } catch (error) {
        console.error("Failed to process file:", error);
      }
    },
    [draftContent, allowAllFiles]
  );

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        await handleFile(file);
      }
    },
    [handleFile]
  );

  // File input handler
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      for (const file of Array.from(files)) {
        await handleFile(file);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleFile]
  );

  // Handle editor mode change
  const handleModeChange = (newMode: EditorMode) => {
    const isCurrentlyStructured = isStructuredContent(draftContent);
    const convertedContent = convertContentForModeChange(
      draftContent,
      draftContent,
      isCurrentlyStructured,
      newMode
    );
    if (convertedContent !== null) {
      setDraftContent(convertedContent);
    }

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
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="gap-1"
                    >
                      <Paperclip className="w-4 h-4" />
                      Attach file
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Attach file (or drag & drop)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </DialogHeader>

        <div
          className={`flex-1 min-h-0 p-4 relative flex flex-col ${
            isDragOver ? "ring-2 ring-[rgb(var(--theme-500))] ring-inset" : ""
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Hidden file input for file attachment */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={allowAllFiles ? undefined : "image/png,image/jpeg,image/gif,image/webp,audio/wav,audio/mpeg,audio/mp3"}
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-4 bg-[rgb(var(--theme-500))]/10 rounded-lg flex items-center justify-center z-10 pointer-events-none">
              <div className="flex items-center gap-2 text-[rgb(var(--theme-500))] font-medium">
                <Paperclip className="w-5 h-5" />
                <span>Drop file here</span>
              </div>
            </div>
          )}

          {/* Editor area - takes remaining space */}
          <div className="flex-1 min-h-0 overflow-hidden">
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

          {/* Attachment previews - fixed at bottom */}
          <div className="flex-shrink-0 overflow-visible">
            <AttachmentPreview
              attachments={attachments}
              onRemove={handleRemoveAttachment}
            />
          </div>
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
