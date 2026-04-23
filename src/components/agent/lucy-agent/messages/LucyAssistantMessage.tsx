/**
 * LucyAssistantMessage
 *
 * Renders an assistant message with step indicator and Lucy styling.
 */

import { DistriMessage } from '@distri/core';
import { useChatStateStore } from '@distri/react';
import { LucyAvatar } from '../LucyAvatar';
import { LucyStepIndicator } from '../LucyStepIndicator';
import { LucyImageRenderer } from '../LucyImageRenderer';
import { extractContent, formatTimestamp } from '../lucy-message-utils';
import { LucyTextRenderer } from '../LucyTextRenderer';

// ============================================================================
// Types
// ============================================================================

export interface LucyAssistantMessageProps {
  message: DistriMessage;
}

// ============================================================================
// Component
// ============================================================================

export function LucyAssistantMessage({ message }: LucyAssistantMessageProps) {
  const steps = useChatStateStore((state) => state.steps);
  const content = extractContent(message);
  const timestamp = formatTimestamp(message.created_at);

  const stepId = message.step_id;
  const step = stepId ? steps.get(stepId) : null;
  const isStreaming = step?.status === 'running';

  if (!content.text && content.imageParts.length === 0) return null;

  return (
    <div className="group">
      {/* Header — tiny avatar + label, timestamp on hover */}
      <div className="flex items-center gap-1.5">
        <LucyAvatar size="xs" />
        <span className="text-xs font-semibold text-foreground/80">Lucy</span>
        {timestamp && (
          <span className="text-[10px] text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors">
            {timestamp}
          </span>
        )}
      </div>

      {/* Message content */}
      <div className="max-w-[100%] mt-0.5">
        {step && <LucyStepIndicator step={step} />}

        {content.text && (
          <div className="overflow-hidden">
            <LucyTextRenderer text={content.text} isStreaming={isStreaming} />
          </div>
        )}

        <LucyImageRenderer imageParts={content.imageParts} />
      </div>
    </div>
  );
}

export default LucyAssistantMessage;
