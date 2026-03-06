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

  // Compact display for plan edit review messages (full content sent to LLM,
  // but we show a short summary in the chat UI to avoid a wall of markdown).
  const isPlanEditReview = content.text?.startsWith('[PLAN_EDIT_REVIEW]');

  return (
    <div className="group pl-3 border-l-2 border-transparent hover:border-border/40 transition-colors">
      {/* Header — compact, timestamp on hover */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs font-semibold text-foreground/80">You</span>
        {timestamp && (
          <span className="text-[10px] text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors">
            {timestamp}
          </span>
        )}
      </div>

      {/* Message content */}
      <div className="overflow-hidden">
        {isPlanEditReview ? (
          <LucyTextRenderer text="I've edited the plan. Please review my changes and re-propose." />
        ) : (
          content.text && <LucyTextRenderer text={content.text} />
        )}
        <LucyImageRenderer imageParts={content.imageParts} />
      </div>
    </div>
  );
}

export default LucyUserMessage;
