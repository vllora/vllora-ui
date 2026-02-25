/**
 * LucyUserMessage
 *
 * Renders a user message bubble with text and images.
 */

import { DistriMessage } from '@distri/core';
import { extractContent, formatTimestamp } from '../lucy-message-utils';
import { LucyTextRenderer } from '../LucyTextRenderer';
import { LucyImageRenderer } from '../LucyImageRenderer';

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
    <div className="flex flex-col items-start gap-1">
      {/* Header — left-aligned, no avatar */}
      <span className="text-xs font-medium text-muted-foreground">
        You {timestamp && <span>• {timestamp}</span>}
      </span>

      {/* Message content — no bubble */}
      <div className="overflow-hidden">
        {content.text && <LucyTextRenderer text={content.text} />}
        <LucyImageRenderer imageParts={content.imageParts} />
      </div>
    </div>
  );
}

export default LucyUserMessage;
