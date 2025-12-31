/**
 * LucyChat
 *
 * Custom chat interface for Lucy AI assistant.
 * Uses useChat hook from @distri/react for logic.
 * Uses custom LucyMessageRenderer for Lucy-themed message display.
 * Custom input and welcome components for Lucy branding.
 *
 * Features parity with Chat from @distri/react:
 * - Message rendering with LucyMessageRenderer (custom Lucy styling)
 * - External tool calls with approval UI
 * - Thinking/typing indicators
 * - Auto-expand for running/error tools
 * - Pending message queue during streaming
 * - Multi-modal support (images)
 * - Custom tool renderers
 * - Callbacks for state changes
 */

import { useCallback, useRef, useEffect, useState } from 'react';
import { useChat, useChatStateStore } from '@distri/react';
import type { ToolRendererMap } from '@distri/react';
import {
  Agent,
  DistriChatMessage,
  DistriMessage,
  DistriFnTool,
  DistriPart,
  ToolExecutionOptions,
} from '@distri/core';
import { LucyChatInput } from './LucyChatInput';
import { LucyWelcome, QuickAction } from './LucyWelcome';
import { LucyToolCalls } from './LucyToolCalls';
import { LucyPendingMessage } from './LucyPendingMessage';
import { LucyStreamingIndicator } from './LucyStreamingIndicator';
import { LucyMessageRenderer } from './LucyMessageRenderer';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface LucyChatProps {
  /** Thread ID for the conversation */
  threadId: string;
  /** The agent instance */
  agent: Agent;
  /** External tools for the chat */
  externalTools?: DistriFnTool[];
  /** Initial messages */
  initialMessages?: DistriChatMessage[];
  /** Callback before sending a message */
  beforeSendMessage?: (message: DistriMessage) => Promise<DistriMessage>;
  /** Callback when a message is received */
  onMessage?: (message: DistriChatMessage) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Get metadata to send with messages */
  getMetadata?: () => Promise<Record<string, unknown>>;
  /** Tool execution options */
  executionOptions?: ToolExecutionOptions;
  /** Custom tool renderers */
  toolRenderers?: ToolRendererMap;
  /** Optional className */
  className?: string;
  /** Custom quick actions */
  quickActions?: QuickAction[];
}

// ============================================================================
// Quick Actions
// ============================================================================

const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'analyze-errors',
    icon: '🔍',
    label: 'Analyze latest error traces',
  },
  {
    id: 'filter-slow',
    icon: '⏱',
    label: 'Filter slow requests (>2s)',
  },
  {
    id: 'optimize-prompt',
    icon: '⚡',
    label: 'Optimize system prompt',
  },
];

// ============================================================================
// Component
// ============================================================================

export function LucyChat({
  threadId,
  agent,
  externalTools,
  initialMessages,
  beforeSendMessage,
  onMessage,
  onError,
  getMetadata,
  executionOptions,
  toolRenderers,
  className,
  quickActions = DEFAULT_QUICK_ACTIONS,
}: LucyChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  // Pending message state - accumulates parts when streaming
  const [pendingMessage, setPendingMessage] = useState<DistriPart[] | null>(null);

  const {
    messages,
    isStreaming,
    isLoading,
    sendMessage,
    stopStreaming,
    error,
  } = useChat({
    threadId,
    agent,
    externalTools,
    executionOptions,
    initialMessages,
    beforeSendMessage,
    onMessage,
    onError,
    getMetadata,
  });

  // Get tool calls state from store
  const toolCalls = useChatStateStore((state) => state.toolCalls);
  const hasPendingToolCalls = useChatStateStore((state) => state.hasPendingToolCalls);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming, toolCalls]);

  // Auto-expand tools that are running or have errors
  useEffect(() => {
    const newExpanded = new Set(expandedTools);
    let hasChanges = false;

    toolCalls.forEach((toolCall) => {
      if (
        toolCall.status === 'running' ||
        toolCall.status === 'error' ||
        toolCall.status === 'user_action_required'
      ) {
        if (!newExpanded.has(toolCall.tool_call_id)) {
          newExpanded.add(toolCall.tool_call_id);
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      setExpandedTools(newExpanded);
    }
  }, [toolCalls, expandedTools]);

  // Auto-send pending message when streaming ends
  useEffect(() => {
    const sendPendingMessage = async () => {
      if (!isStreaming && pendingMessage && pendingMessage.length > 0) {
        const messageToSend = [...pendingMessage];
        setPendingMessage(null);

        try {
          await sendMessage(messageToSend);
        } catch (err) {
          console.error('Failed to send pending message:', err);
          if (onError && err instanceof Error) {
            onError(err);
          }
        }
      }
    };

    sendPendingMessage();
  }, [isStreaming, pendingMessage, sendMessage, onError]);

  // Helper to convert content to parts
  const contentToParts = useCallback((content: string | DistriPart[]): DistriPart[] => {
    if (typeof content === 'string') {
      return [{ part_type: 'text', data: content }];
    }
    return content;
  }, []);

  // Handle sending a message (with pending queue support)
  const handleSend = useCallback(
    async (content: string | DistriPart[]) => {
      if (typeof content === 'string' && !content.trim()) return;
      if (Array.isArray(content) && content.length === 0) return;

      setInput('');

      // If streaming, add to pending message parts instead of sending immediately
      if (isStreaming) {
        const newParts = contentToParts(content);
        setPendingMessage((prev) => (prev ? [...prev, ...newParts] : newParts));
      } else {
        await sendMessage(content);
      }
    },
    [sendMessage, isStreaming, contentToParts]
  );

  // Handle stop streaming
  const handleStopStreaming = useCallback(() => {
    stopStreaming();
    // Reset streaming states in the store
    useChatStateStore.getState().resetStreamingStates();
  }, [stopStreaming]);

  // Handle quick action click
  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      handleSend(action.label);
    },
    [handleSend]
  );

  // Toggle tool expansion
  const toggleToolExpansion = useCallback((toolId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  }, []);

  // Check if we should show welcome state
  const showWelcome = messages.length === 0 && !isLoading;

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
          {showWelcome ? (
            <LucyWelcome quickActions={quickActions} onQuickAction={handleQuickAction} />
          ) : (
            <>
              {/* Render messages using LucyMessageRenderer */}
              {messages.map((message, index) => (
                <LucyMessageRenderer
                  key={`msg-${index}`}
                  message={message}
                  index={index}
                  toolRenderers={toolRenderers}
                  isExpanded={expandedTools.has(`msg-${index}`)}
                  onToggle={() => toggleToolExpansion(`msg-${index}`)}
                />
              ))}

              {/* Render external tool calls that need user approval */}
              <LucyToolCalls />

              {/* Render streaming indicator (typing/thinking) */}
              <LucyStreamingIndicator />

              {/* Render pending message */}
              <LucyPendingMessage pendingMessage={pendingMessage} />

              {/* Error display */}
              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                  {error.message}
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-border bg-background/80 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <LucyChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            onStop={handleStopStreaming}
            isStreaming={isStreaming}
            disabled={isLoading || hasPendingToolCalls()}
            placeholder={
              isStreaming ? 'Message will be queued...' : 'Ask Lucy to analyze traces or optimize...'
            }
          />
        </div>
      </div>
    </div>
  );
}

export default LucyChat;
