/**
 * LucyMessage
 *
 * Message bubble component for Lucy chat.
 * Handles both user and assistant messages with proper styling.
 */

import { useMemo } from 'react';
import { DistriChatMessage, DistriMessage, isDistriMessage } from '@distri/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LucyAvatar } from './LucyAvatar';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface LucyMessageProps {
  /** The message to render */
  message: DistriChatMessage;
  /** Optional className */
  className?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function formatTimestamp(timestamp?: string | number): string {
  if (!timestamp) return 'Just now';

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins === 1) return '1 min ago';
  if (diffMins < 60) return `${diffMins} mins ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;

  return date.toLocaleDateString();
}

function extractTextContent(message: DistriChatMessage): { text: string; timestamp?: string | number } {
  if (isDistriMessage(message)) {
    const msg = message as DistriMessage;
    const textParts = msg.parts
      ?.filter((p) => p.part_type === 'text')
      ?.map((p) => (p as { part_type: 'text'; data: string }).data)
      ?.filter((text) => text && text.trim()) || [];

    return {
      text: textParts.join(' ').trim(),
      timestamp: msg.created_at,
    };
  }
  return { text: '', timestamp: undefined };
}

// ============================================================================
// Component
// ============================================================================

export function LucyMessage({ message, className }: LucyMessageProps) {
  const { role, text, timestamp } = useMemo(() => {
    if (isDistriMessage(message)) {
      const msg = message as DistriMessage;
      const extracted = extractTextContent(msg);
      return {
        role: msg.role,
        text: extracted.text,
        timestamp: extracted.timestamp,
      };
    }
    return { role: 'assistant' as const, text: '', timestamp: undefined };
  }, [message]);

  const isUser = role === 'user';
  const timeLabel = formatTimestamp(timestamp);

  // Don't render empty messages
  if (!text) {
    return null;
  }

  if (isUser) {
    return (
      <div className={cn('flex flex-col items-start gap-1', className)}>
        {/* Header — left-aligned, no avatar */}
        <span className="text-xs font-medium text-muted-foreground">
          You • {timeLabel}
        </span>

        {/* Message content — no bubble */}
        <div className="text-sm text-foreground whitespace-pre-wrap overflow-hidden">
          {text}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      {/* Header: tiny avatar + name + timestamp */}
      <div className="flex items-center gap-1.5">
        <LucyAvatar size="xs" />
        <span className="text-xs font-medium text-muted-foreground">
          Lucy • {timeLabel}
        </span>
      </div>

      {/* Message content — no bubble */}
      <div className="max-w-[100%] overflow-hidden">
        <div className="prose prose-sm prose-invert max-w-none text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {text}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

export default LucyMessage;
