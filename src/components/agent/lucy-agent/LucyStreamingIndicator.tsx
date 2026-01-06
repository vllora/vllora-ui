/**
 * LucyStreamingIndicator
 *
 * Displays typing or thinking indicator during streaming.
 * Shows TypingIndicator for typing state, ThinkingRenderer for thinking/generating.
 */

import { ThinkingRenderer, TypingIndicator, useChatStateStore } from '@distri/react';

// ============================================================================
// Component
// ============================================================================

export function LucyStreamingIndicator() {
  const streamingIndicator = useChatStateStore((state) => state.streamingIndicator);
  const currentThought = useChatStateStore((state) => state.currentThought);

  if (!streamingIndicator) return null;

  if (streamingIndicator === 'typing') {
    return <TypingIndicator />;
  }

  return <ThinkingRenderer indicator={streamingIndicator} thoughtText={currentThought} />;
}

export default LucyStreamingIndicator;
