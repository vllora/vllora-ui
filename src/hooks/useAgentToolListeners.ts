/**
 * Hook to listen for Distri agent tool events and respond with UI state
 *
 * This hook bridges the gap between the agent's external tools and the UI.
 * When an agent calls get_collapsed_spans, this hook listens for the
 * request event and responds with the appropriate data.
 */

import { useEffect } from 'react';
import { emitter } from '@/utils/eventEmitter';

interface UseAgentToolListenersOptions {
  collapsedSpanIds?: string[];
}

export function useAgentToolListeners(options: UseAgentToolListenersOptions = {}) {
  const { collapsedSpanIds = [] } = options;

  useEffect(() => {
    // Handler for get_collapsed_spans
    const handleGetCollapsedSpans = () => {
      emitter.emit('vllora_collapsed_spans_response', {
        collapsedSpanIds,
      });
    };

    // Register event listeners
    emitter.on('vllora_get_collapsed_spans', handleGetCollapsedSpans);

    // Cleanup
    return () => {
      emitter.off('vllora_get_collapsed_spans', handleGetCollapsedSpans);
    };
  }, [collapsedSpanIds]);
}
