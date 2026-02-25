/**
 * LucyStreamingIndicator
 *
 * Displays typing or thinking indicator during streaming.
 * Shows TypingIndicator for typing state, ThinkingRenderer for thinking/generating.
 */

import { ThinkingRenderer, useChatStateStore } from '@distri/react';
import { LucyTypingIndicator } from './LucyTypingIndicator';

// ============================================================================
// Types
// ============================================================================

interface LucyStreamingIndicatorProps {
  /** Optional override - if false, hides the indicator regardless of streaming state */
  isStreaming?: boolean;
  /** When true, hide the "typing" dots (tool call spinners already show activity) */
  hideWhenToolsActive?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function LucyStreamingIndicator({ isStreaming, hideWhenToolsActive }: LucyStreamingIndicatorProps = {}) {
  const streamingIndicator = useChatStateStore((state) => state.streamingIndicator);
  const currentThought = useChatStateStore((state) => state.currentThought);

  // If isStreaming is explicitly false, hide the indicator
  if (isStreaming === false) return null;

  // If no streaming indicator from store, hide
  if (!streamingIndicator) return null;

  // Hide "typing" dots when tool call spinners are already visible —
  // they provide sufficient feedback that Lucy is working.
  // Still show "thinking" indicator since that's a distinct state.
  if (streamingIndicator === 'typing' && hideWhenToolsActive) return null;

  if (streamingIndicator === 'typing') {
    return <LucyTypingIndicator />;
  }

  return <ThinkingRenderer indicator={streamingIndicator} thoughtText={currentThought} />;
}

export default LucyStreamingIndicator;
