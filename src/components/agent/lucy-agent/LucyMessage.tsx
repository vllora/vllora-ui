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

function getUserInitials(name?: string): string {
  if (!name) return 'U';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
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
// User Avatar
// ============================================================================

interface UserAvatarProps {
  name?: string;
  className?: string;
}

function UserAvatar({ name, className }: UserAvatarProps) {
  const initials = getUserInitials(name);

  return (
    <div
      className={cn(
        'w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-medium',
        className
      )}
    >
      {initials}
    </div>
  );
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
      <div className={cn('flex flex-col items-end gap-1', className)}>
        {/* Header: timestamp + avatar */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>You</span>
          <span>•</span>
          <span>{timeLabel}</span>
          <UserAvatar name="User" />
        </div>

        {/* Message bubble */}
        <div className="max-w-[85%] bg-purple-900/30 border border-purple-800/30 rounded-2xl rounded-tr-sm px-4 py-3">
          <div className="text-sm text-foreground whitespace-pre-wrap">
            {text}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      {/* Header: avatar + name + timestamp */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <LucyAvatar size="sm" />
        <span className="font-medium text-foreground">Lucy</span>
        <span>•</span>
        <span>{timeLabel}</span>
      </div>

      {/* Message bubble */}
      <div className="max-w-[85%] bg-muted/50 border border-border rounded-2xl rounded-tl-sm px-4 py-3 ml-8">
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
