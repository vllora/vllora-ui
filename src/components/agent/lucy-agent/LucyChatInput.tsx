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
    <div className={cn('space-y-2', className)}>
      {/* Attached images preview */}
      {attachedImages.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3">
          {attachedImages.map((img) => (
            <div
              key={img.id}
              className="relative group w-16 h-16 rounded-lg overflow-hidden border border-border"
            >
              <img
                src={img.preview}
                alt={img.name}
                className="w-full h-full object-cover"
              />
              {onRemoveImage && (
                <button
                  onClick={() => onRemoveImage(img.id)}
                  className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Input container */}
      <div className="relative flex items-end gap-2 bg-muted/50 rounded-xl border border-border p-3">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isStreaming}
          rows={1}
          className={cn(
            'flex-1 bg-transparent resize-none outline-none text-sm',
            'placeholder:text-muted-foreground',
            'min-h-[24px] max-h-[200px]',
            'disabled:opacity-50'
          )}
        />

        {/* Send/Stop button */}
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!canSend && !isStreaming}
          className={cn(
            'h-8 w-8 rounded-full shrink-0',
            isStreaming
              ? 'bg-destructive hover:bg-destructive/90'
              : 'bg-emerald-600 hover:bg-emerald-700'
          )}
        >
          {isStreaming ? (
            <Square className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between text-muted-foreground">
        <div className="flex items-center gap-1">
          {/* Attachment button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={disabled || isStreaming || !onAddImages}
            onClick={handleAttachClick}
            title="Attach image"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          {/* Voice button with wave indicator */}
          {voiceEnabled && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7 transition-all duration-300',
                  isStreamingVoice && 'text-emerald-500 bg-emerald-500/15 shadow-[0_0_10px_2px_rgba(16,185,129,0.4)]'
                )}
                disabled={disabled || isStreaming || !onStartStreamingVoice}
                onClick={handleVoiceClick}
                title={isStreamingVoice ? 'Listening...' : 'Voice input'}
              >
                <Mic className="h-4 w-4" />
              </Button>
              {/* Audio wave animation */}
              {isStreamingVoice && (
                <div className="flex items-end gap-0.5 h-4 ml-1">
                  <span className="w-0.5 h-2 bg-emerald-500 rounded-full animate-audio-wave" style={{ animationDelay: '0ms' }} />
                  <span className="w-0.5 h-3 bg-emerald-500 rounded-full animate-audio-wave" style={{ animationDelay: '150ms' }} />
                  <span className="w-0.5 h-4 bg-emerald-500 rounded-full animate-audio-wave" style={{ animationDelay: '300ms' }} />
                  <span className="w-0.5 h-2.5 bg-emerald-500 rounded-full animate-audio-wave" style={{ animationDelay: '450ms' }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LucyChatInput;
