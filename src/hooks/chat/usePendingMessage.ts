/**
 * usePendingMessage
 *
 * Manages pending message queue during streaming.
 * When the AI is streaming a response, user messages are queued
 * and automatically sent when streaming ends.
 */

import { useState, useEffect, useCallback } from 'react';
import type { DistriPart } from '@distri/core';

// ============================================================================
// Types
// ============================================================================

export interface UsePendingMessageOptions {
  /** Whether the chat is currently streaming */
  isStreaming: boolean;
  /** Function to send a message */
  sendMessage: (content: DistriPart[]) => Promise<void>;
  /** Optional callback when pending message fails to send */
  onError?: (error: Error) => void;
}

export interface UsePendingMessageReturn {
  /** Current pending message parts (null if none) */
  pendingMessage: DistriPart[] | null;
  /** Queue content to be sent (immediately if not streaming, queued if streaming) */
  queueOrSend: (content: string | DistriPart[]) => Promise<void>;
  /** Clear the pending message queue */
  clearPending: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert string or parts array to DistriPart[]
 */
function contentToParts(content: string | DistriPart[]): DistriPart[] {
  if (typeof content === 'string') {
    return [{ part_type: 'text', data: content }];
  }
  return content;
}

// ============================================================================
// Hook
// ============================================================================

export function usePendingMessage({
  isStreaming,
  sendMessage,
  onError,
}: UsePendingMessageOptions): UsePendingMessageReturn {
  const [pendingMessage, setPendingMessage] = useState<DistriPart[] | null>(null);

  // Auto-send pending message when streaming ends
  useEffect(() => {
    const sendPendingMessage = async () => {
      if (!isStreaming && pendingMessage && pendingMessage.length > 0) {
        const messageToSend = [...pendingMessage];
        setPendingMessage(null);

        try {
          await sendMessage(messageToSend);
        } catch (err) {
          console.error('[usePendingMessage] Failed to send pending message:', err);
          if (onError && err instanceof Error) {
            onError(err);
          }
        }
      }
    };

    sendPendingMessage();
  }, [isStreaming, pendingMessage, sendMessage, onError]);

  // Queue content or send immediately based on streaming state
  const queueOrSend = useCallback(
    async (content: string | DistriPart[]) => {
      const parts = contentToParts(content);

      if (parts.length === 0) return;

      if (isStreaming) {
        // Queue for later
        setPendingMessage((prev) => (prev ? [...prev, ...parts] : parts));
      } else {
        // Send immediately
        await sendMessage(parts);
      }
    },
    [isStreaming, sendMessage]
  );

  // Clear pending queue
  const clearPending = useCallback(() => {
    setPendingMessage(null);
  }, []);

  return {
    pendingMessage,
    queueOrSend,
    clearPending,
  };
}

export default usePendingMessage;
