/**
 * LucyChatInput
 *
 * Custom chat input for Lucy with clean design.
 * Features: auto-resize textarea, image attachments, voice input, browser preview toggle.
 */

import { useCallback, useRef, useEffect, KeyboardEvent, ChangeEvent } from 'react';
import { Send, Square, Paperclip, Mic, X } from 'lucide-react';
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

  // Image attachment props
  /** Attached images */
  attachedImages?: AttachedImage[];
  /** Callback to remove an image */
  onRemoveImage?: (id: string) => void;
  /** Callback to add images */
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
  // Image props
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

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

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
    [value, attachedImages, isStreaming, disabled]
  );

  // Handle send with images
  const handleSend = useCallback(() => {
    if (isStreaming && onStop) {
      onStop();
      return;
    }

    if (attachedImages.length > 0) {
      // Send with images as DistriPart[]
      const parts: DistriPart[] = [];

      // Add text part if present
      if (value.trim()) {
        parts.push({ part_type: 'text', data: value.trim() });
      }

      // Add image parts as base64 bytes
      for (const img of attachedImages) {
        parts.push({
          part_type: 'image',
          data: {
            type: 'bytes' as const,
            mime_type: img.mimeType,
            data: img.base64,
            name: img.name,
          },
        });
      }

      onSend(parts);
    } else if (value.trim()) {
      onSend(value);
    }
  }, [value, attachedImages, onSend, onStop, isStreaming]);

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

  const canSend = (value.trim().length > 0 || attachedImages.length > 0) && !disabled;

  return (
    <div className={cn('border-t border-border p-4 bg-card', className)}>
      {/* Attached images preview */}
      {attachedImages.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachedImages.map((img) => (
            <div
              key={img.id}
              className="relative group bg-secondary rounded-lg p-2 flex items-center gap-2 border border-border"
            >
              <img
                src={img.preview}
                alt={img.name}
                className="w-12 h-12 object-cover rounded"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground truncate">{img.name}</p>
              </div>
              {onRemoveImage && (
                <button
                  onClick={() => onRemoveImage(img.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Input container with focus ring */}
      <div className="bg-secondary rounded-xl border border-input focus-within:border-[rgb(var(--theme-500))] focus-within:shadow-[0_0_0_3px_rgba(var(--theme-rgb),0.1)] transition-all">
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
              title="Attach image"
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
