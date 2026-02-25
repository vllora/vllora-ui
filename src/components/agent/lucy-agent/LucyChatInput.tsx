/**
 * LucyChatInput
 *
 * Custom chat input for Lucy with clean design.
 * Features: auto-resize textarea, file attachments (images, PDFs, docs),
 * drag & drop support, voice input.
 */

import { useCallback, useRef, useEffect, useState, KeyboardEvent, ChangeEvent, DragEvent } from 'react';
import { Send, Square, Paperclip, Mic, X, FileText, Upload } from 'lucide-react';
import { DistriPart } from '@distri/core';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface AttachedImage {
  id: string;
  file: File;
  preview: string; // Blob URL for local preview
  base64: string; // Base64 data for sending
  mimeType: string;
  name: string;
}

/** Extended file attachment that supports non-image files */
export interface AttachedFile extends AttachedImage {
  /** Type of file for UI display */
  fileType: 'image' | 'pdf' | 'document' | 'other';
}

/** Accepted file types for upload */
const ACCEPTED_FILE_TYPES = [
  'image/*',
  'application/pdf',
  '.pdf',
  '.txt',
  '.md',
  '.json',
  '.csv',
].join(',');

/** Check if a file is an image */
function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/** Get file type category for display */
function getFileType(file: File): AttachedFile['fileType'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) return 'pdf';
  if (['text/plain', 'text/markdown', 'application/json', 'text/csv'].includes(file.type) ||
      file.name.match(/\.(txt|md|json|csv)$/)) return 'document';
  return 'other';
}

export interface LucyChatInputProps {
  /** Current input value */
  value: string;
  /** Callback when input changes */
  onChange: (value: string) => void;
  /** Callback when message is sent (supports string or DistriPart[]) */
  onSend: (content: string | DistriPart[]) => void;
  /** Callback to stop streaming */
  onStop?: () => void;
  /** Whether currently streaming a response */
  isStreaming?: boolean;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Optional className */
  className?: string;

  // File attachment props
  /** Attached images/files */
  attachedImages?: AttachedImage[];
  /** Callback to remove an image/file */
  onRemoveImage?: (id: string) => void;
  /** Callback to add images/files */
  onAddImages?: (files: FileList | File[]) => void;

  // Voice input props
  /** Whether voice input is enabled */
  voiceEnabled?: boolean;
  /** Callback to start streaming voice */
  onStartStreamingVoice?: () => void;
  /** Whether currently streaming voice */
  isStreamingVoice?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function LucyChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder = 'Type your message...',
  className,
  // File props
  attachedImages = [],
  onRemoveImage,
  onAddImages,
  // Voice props
  voiceEnabled = false,
  onStartStreamingVoice,
  isStreamingVoice = false,
}: LucyChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  // Handle send with files
  const handleSend = useCallback(() => {
    if (isStreaming && onStop) {
      onStop();
      return;
    }

    if (attachedImages.length > 0) {
      // Send with files as DistriPart[]
      const parts: DistriPart[] = [];

      // Add text part if present
      if (value.trim()) {
        parts.push({ part_type: 'text', data: value.trim() });
      }

      // Add file parts
      for (const file of attachedImages) {
        if (isImageFile(file.file)) {
          // Images go as image parts
          parts.push({
            part_type: 'image',
            data: {
              type: 'bytes' as const,
              mime_type: file.mimeType,
              data: file.base64,
              name: file.name,
            },
          });
        } else {
          // Non-image files: include as text with metadata
          // The agent will receive this and can process via upload_knowledge_source
          parts.push({
            part_type: 'text',
            data: `[Attached file: ${file.name} (${file.mimeType})]`,
          });
          // Also add the file data as a custom part that can be processed
          parts.push({
            part_type: 'file' as any,
            data: {
              type: 'bytes' as const,
              mime_type: file.mimeType,
              data: file.base64,
              name: file.name,
            },
          });
        }
      }

      onSend(parts);
    } else if (value.trim()) {
      onSend(value);
    }
  }, [value, attachedImages, onSend, onStop, isStreaming]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if ((value.trim() || attachedImages.length > 0) && !isStreaming && !disabled) {
          handleSend();
        }
      }
    },
    [value, attachedImages, isStreaming, disabled, handleSend]
  );

  // Handle file selection
  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && onAddImages) {
        onAddImages(files);
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [onAddImages]
  );

  // Handle attachment button click
  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle voice button click
  const handleVoiceClick = useCallback(() => {
    if (onStartStreamingVoice) {
      onStartStreamingVoice();
    }
  }, [onStartStreamingVoice]);

  // ============================================================================
  // Drag and Drop Handlers
  // ============================================================================

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0 && onAddImages) {
      onAddImages(files);
    }
  }, [onAddImages]);

  const canSend = (value.trim().length > 0 || attachedImages.length > 0) && !disabled;

  // Get file type info for display
  const getFileTypeInfo = (file: AttachedImage) => {
    const fileType = getFileType(file.file);
    return { fileType, isImage: fileType === 'image' };
  };

  return (
    <div
      ref={dropZoneRef}
      className={cn('border-t border-border p-4 bg-card relative', className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[rgba(var(--theme-500),0.1)] border-2 border-dashed border-[rgb(var(--theme-500))] rounded-lg backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-[rgb(var(--theme-600))]">
            <Upload className="w-8 h-8" />
            <span className="text-sm font-medium">Drop files here</span>
            <span className="text-xs text-muted-foreground">Images, PDFs, or documents</span>
          </div>
        </div>
      )}

      {/* Attached files preview */}
      {attachedImages.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachedImages.map((file) => {
            const { fileType, isImage } = getFileTypeInfo(file);
            return (
              <div
                key={file.id}
                className="relative group bg-secondary rounded-lg p-2 flex items-center gap-2 border border-border"
              >
                {isImage ? (
                  <img
                    src={file.preview}
                    alt={file.name}
                    className="w-12 h-12 object-cover rounded"
                  />
                ) : (
                  <div className={cn(
                    "w-12 h-12 rounded flex items-center justify-center",
                    fileType === 'pdf' ? 'bg-red-500/10' : 'bg-blue-500/10'
                  )}>
                    {fileType === 'pdf' ? (
                      <FileText className="w-6 h-6 text-red-500" />
                    ) : (
                      <FileText className="w-6 h-6 text-blue-500" />
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate">{file.name}</p>
                  {!isImage && (
                    <p className="text-[10px] text-muted-foreground uppercase">{fileType}</p>
                  )}
                </div>
                {onRemoveImage && (
                  <button
                    onClick={() => onRemoveImage(file.id)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Voice listening indicator */}
      {isStreamingVoice && (
        <div className="animate-pulse text-xs mb-2 text-muted-foreground flex items-center gap-2">
          <span>Listening...</span>
          <div className="flex items-end gap-0.5 h-4">
            <span className="w-0.5 h-2 bg-[rgb(var(--theme-500))] rounded-full animate-audio-wave" style={{ animationDelay: '0ms' }} />
            <span className="w-0.5 h-3 bg-[rgb(var(--theme-500))] rounded-full animate-audio-wave" style={{ animationDelay: '150ms' }} />
            <span className="w-0.5 h-4 bg-[rgb(var(--theme-500))] rounded-full animate-audio-wave" style={{ animationDelay: '300ms' }} />
            <span className="w-0.5 h-2.5 bg-[rgb(var(--theme-500))] rounded-full animate-audio-wave" style={{ animationDelay: '450ms' }} />
          </div>
        </div>
      )}

      {/* Hidden file input - now accepts more file types */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Input container with focus ring */}
      <div className="bg-secondary rounded-lg border border-input focus-within:border-[rgb(var(--theme-500))] transition-all">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isStreaming}
          rows={1}
          className="w-full bg-transparent text-secondary-foreground placeholder-text-[9px] placeholder-muted-foreground resize-none
            focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed
            max-h-[200px] overflow-y-auto px-4 pt-3 pb-2"
        />

        {/* Bottom toolbar inside input */}
        <div className="flex items-center justify-between gap-2 px-3 pb-2">
          <div className="flex items-center gap-1">
            {/* Attachment button */}
            <button
              type="button"
              onClick={handleAttachClick}
              disabled={disabled || isStreaming || !onAddImages}
              className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent transition-colors disabled:opacity-50"
              title="Attach files — documents become reference sources, images are sent to Lucy"
            >
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Voice button */}
            {voiceEnabled && (
              <button
                type="button"
                disabled={disabled || isStreaming || !onStartStreamingVoice}
                onClick={handleVoiceClick}
                className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                title={isStreamingVoice ? 'Listening...' : 'Voice input'}
              >
                <Mic className={cn(
                  'h-4 w-4',
                  isStreamingVoice ? 'text-[rgb(var(--theme-500))] animate-pulse' : 'text-muted-foreground'
                )} />
              </button>
            )}
          </div>

          {/* Send/Stop button */}
          <Button
            onClick={handleSend}
            disabled={!canSend && !isStreaming}
            size="icon"
            className={cn(
              'h-8 w-8 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg',
              isStreaming
                ? 'bg-destructive hover:bg-destructive/90 text-white'
                : 'bg-[rgb(var(--theme-600))] hover:bg-[rgb(var(--theme-700))] text-white dark:bg-[rgb(var(--theme-600))] dark:hover:bg-[rgb(var(--theme-700))]'
            )}
            title={isStreaming ? 'Stop' : 'Send message'}
          >
            {isStreaming ? (
              <Square className="w-4 h-4 fill-current" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default LucyChatInput;
