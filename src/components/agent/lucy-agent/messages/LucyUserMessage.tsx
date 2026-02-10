/**
 * LucyUserMessage
 *
 * Renders a user message bubble with text and images.
 */

import { DistriMessage } from '@distri/core';
import { extractContent, formatTimestamp } from '../lucy-message-utils';
import { LucyTextRenderer } from '../LucyTextRenderer';
import { LucyImageRenderer } from '../LucyImageRenderer';
import { UserAvatar } from '../UserAvatar';

// ============================================================================
// Types
// ============================================================================

export interface LucyUserMessageProps {
  message: DistriMessage;
}

// ============================================================================
// Component
// ============================================================================

export function LucyUserMessage({ message }: LucyUserMessageProps) {
  const content = extractContent(message);
  const timestamp = formatTimestamp(message.created_at);

  if (!content.text && content.imageParts.length === 0) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-muted-foreground">
          You {timestamp && <span>• {timestamp}</span>}
        </span>
        <UserAvatar size="sm" />
      </div>

      {/* Message bubble */}
      <div className="max-w-[100%] w-full bg-muted/40 border border-border/50 rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm overflow-hidden">
        {content.text && <LucyTextRenderer text={content.text} />}
        <LucyImageRenderer imageParts={content.imageParts} />
      </div>
    </div>
  );
}

export default LucyUserMessage;
