/**
 * LucyUserMessage
 *
 * Renders a user message bubble with text and images.
 */

import { DistriMessage } from '@distri/core';
import { User } from 'lucide-react';
import { extractContent, formatTimestamp } from './lucy-message-utils';
import { LucyTextRenderer } from './LucyTextRenderer';
import { LucyImageRenderer } from './LucyImageRenderer';

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
    <div className="flex flex-col items-end gap-1">
      {/* Header */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>You</span>
        {timestamp && (
          <>
            <span>-</span>
            <span>{timestamp}</span>
          </>
        )}
        <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
          <User className="h-3 w-3 text-white" />
        </div>
      </div>

      {/* Message bubble */}
      <div className="max-w-[85%] bg-purple-900/30 border border-purple-800/30 rounded-2xl rounded-tr-sm px-4 py-3">
        {content.text && <LucyTextRenderer text={content.text} />}
        <LucyImageRenderer imageParts={content.imageParts} />
      </div>
    </div>
  );
}

export default LucyUserMessage;
