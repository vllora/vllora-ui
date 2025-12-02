import { useState, useMemo, useRef, useCallback } from "react";
import { Maximize2, X, Copy, Check, Paperclip, Wrench } from "lucide-react";
import type { Message, MessageContentPart, ToolCall } from "@/hooks/useExperiment";
import { normalizeContentToString } from "@/utils/templateUtils";
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
import { ToolCallsEditor } from "./ToolCallsEditor";

interface MessageEditorProps {
  message: Message;
  index: number;
  updateMessage: (index: number, content: string | MessageContentPart[]) => void;
  updateMessageRole: (index: number, role: Message["role"]) => void;
  updateMessageToolCalls?: (index: number, toolCalls: ToolCall[]) => void;
  deleteMessage: (index: number) => void;
  isHighlighted?: boolean;
  /** When true, allows attaching any file type. When false, only images and audio are allowed. */
  allowAllFiles?: boolean;
}

export function MessageEditor({
  message,
  index,
  updateMessage,
  updateMessageRole,
  updateMessageToolCalls,
  deleteMessage,
  isHighlighted,
  allowAllFiles = false,
}: MessageEditorProps) {
  // Determine initial editor mode based on content
  const initialMode = useMemo((): EditorMode => {
    if (isStructuredContent(message.content)) return "structured";
    return "plain";
  }, []);

  const [editorMode, setEditorMode] = useState<EditorMode>(initialMode);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep track if content is structured (for display purposes)
  const isStructured = useMemo(
    () => isStructuredContent(message.content),
    [message.content]
  );

  // Normalize content to string for editing
  const contentAsString = normalizeContentToString(message.content);

  // Extract attachments for preview
  const attachments = useMemo(
    () => extractAttachments(message.content),
    [message.content]
  );

  // Handle removing an attachment
  const handleRemoveAttachment = useCallback(
    (attachmentIndex: number) => {
      const newContent = removeAttachment(message.content, attachmentIndex);
      updateMessage(index, newContent);
      // If content becomes plain text, switch to plain mode
      if (!isStructuredContent(newContent)) {
        setEditorMode("plain");
      }
    },
    [message.content, index, updateMessage]
  );

  // Handle editor mode change
  const handleModeChange = (newMode: EditorMode) => {
    const convertedContent = convertContentForModeChange(
      message.content,
      contentAsString,
      isStructured,
      newMode
    );
    if (convertedContent !== null) {
      updateMessage(index, convertedContent);
    }
    setEditorMode(newMode);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(contentAsString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle file processing (images, audio, and generic files)
  const handleFile = useCallback(
    async (file: File) => {
      try {
        let newContent: string;
        if (isImageFile(file)) {
          // Images use data URL format
          const base64Url = await fileToBase64(file);
          newContent = addImageToContent(message.content, base64Url);
        } else if (isAudioFile(file)) {
          // Audio uses raw base64 with format
          const base64Data = await fileToBase64Raw(file);
          const format = getAudioFormat(file);
          newContent = addAudioToContent(message.content, base64Data, format);
        } else if (allowAllFiles) {
          // Generic files use raw base64 with filename (only when enabled)
          const base64Data = await fileToBase64Raw(file);
          newContent = addFileToContent(message.content, base64Data, file.name);
        } else {
          // Generic files not allowed
          console.warn("File type not supported. Only images and audio files are allowed.");
          return;
        }
        updateMessage(index, newContent);
        setEditorMode("structured");
      } catch (error) {
        console.error("Failed to process file:", error);
      }
    },
    [message.content, index, updateMessage, allowAllFiles]
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

      // Reset the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleFile]
  );

  return (
    <>
      <div
        className={`border border-border rounded-lg p-3 bg-card transition-all relative ${
          isHighlighted ? "animate-highlight-flash" : ""
        } ${isDragOver ? "ring-2 ring-[rgb(var(--theme-500))] border-transparent" : ""}`}
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
          <div className="absolute inset-0 bg-[rgb(var(--theme-500))]/10 rounded-lg flex items-center justify-center z-10 pointer-events-none">
            <div className="flex items-center gap-2 text-[rgb(var(--theme-500))] font-medium">
              <Paperclip className="w-5 h-5" />
              <span>Drop file here</span>
            </div>
          </div>
        )}
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
                {/* Attach file button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Attach file</TooltipContent>
                </Tooltip>

                {/* Add tool call button - only for assistant messages */}
                {message.role === "assistant" && updateMessageToolCalls && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          const newToolCall: ToolCall = {
                            id: `call_${Date.now()}`,
                            type: "function",
                            function: {
                              name: "new_function",
                              arguments: "{}",
                            },
                          };
                          updateMessageToolCalls(index, [...(message.tool_calls || []), newToolCall]);
                        }}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Wrench className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Add tool call</TooltipContent>
                  </Tooltip>
                )}

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

        {/* Attachment previews */}
        <AttachmentPreview
          attachments={attachments}
          onRemove={handleRemoveAttachment}
        />

        {/* Tool calls editor - only show for assistant messages with tool calls */}
        {message.role === "assistant" && message.tool_calls && message.tool_calls.length > 0 && updateMessageToolCalls && (
          <ToolCallsEditor
            toolCalls={message.tool_calls}
            onChange={(toolCalls) => updateMessageToolCalls(index, toolCalls)}
          />
        )}
      </div>

      {/* Expanded editor dialog */}
      <MessageEditorDialog
        message={message}
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        initialEditorMode={editorMode}
        allowAllFiles={allowAllFiles}
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
