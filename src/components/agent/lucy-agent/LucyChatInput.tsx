/**
 * LucyChatInput
 *
 * Custom chat input for Lucy with clean design.
 * Features: auto-resize textarea, attachment/mic icons, send button.
 */

import { useCallback, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Square, Paperclip, Mic, MonitorPlay } from 'lucide-react';
import { DistriPart } from '@distri/core';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

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
}: LucyChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        if (value.trim() && !isStreaming && !disabled) {
          onSend(value);
        }
      }
    },
    [value, onSend, isStreaming, disabled]
  );

  // Handle send button click
  const handleSendClick = useCallback(() => {
    if (isStreaming && onStop) {
      onStop();
    } else if (value.trim() && !disabled) {
      onSend(value);
    }
  }, [value, onSend, onStop, isStreaming, disabled]);

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className={cn('space-y-2', className)}>
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
          onClick={handleSendClick}
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

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between text-muted-foreground">
        <div className="flex items-center gap-1">
          {/* Attachment button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={disabled || isStreaming}
            title="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          {/* Mic button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={disabled || isStreaming}
            title="Voice input"
          >
            <Mic className="h-4 w-4" />
          </Button>

          {/* Browser preview toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={disabled || isStreaming}
            title="Browser preview"
          >
            <MonitorPlay className="h-4 w-4" />
          </Button>
        </div>

        {/* Hint */}
        <span className="text-xs">Shift + Enter for new line</span>
      </div>
    </div>
  );
}

export default LucyChatInput;
