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
}

// ============================================================================
// Component
// ============================================================================

export function LucyStreamingIndicator({ isStreaming }: LucyStreamingIndicatorProps = {}) {
  const streamingIndicator = useChatStateStore((state) => state.streamingIndicator);
  const currentThought = useChatStateStore((state) => state.currentThought);

  // If isStreaming is explicitly false, hide the indicator
  if (isStreaming === false) return null;

  // If no streaming indicator from store, hide
  if (!streamingIndicator) return null;

  if (streamingIndicator === 'typing') {
    return <LucyTypingIndicator />;
  }

  return <ThinkingRenderer indicator={streamingIndicator} thoughtText={currentThought} />;
}

export default LucyStreamingIndicator;
