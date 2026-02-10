/**
 * LucyChat
 *
 * Custom chat interface for Lucy AI assistant.
 * Uses useChat hook from @distri/react for core chat logic.
 * Uses custom hooks for pending messages, file attachments, and tool expansion.
 * Uses custom LucyMessageRenderer for Lucy-themed message display.
 *
 * Features:
 * - Message rendering with LucyMessageRenderer (custom Lucy styling)
 * - External tool calls with approval UI
 * - Thinking/typing indicators
 * - Auto-expand for running/error tools
 * - Pending message queue during streaming
 * - Multi-modal support (images, PDFs, documents)
 * - Custom tool renderers
 * - Auto-trigger prompts for proactive analysis
 */

import { useCallback, useRef, useEffect, useState } from 'react';
import { useChat, useChatStateStore, TodosDisplay } from '@distri/react';
import type { ToolRendererMap, DistriAnyTool } from '@distri/react';
import { Agent, DistriChatMessage, DistriMessage, DistriPart, ToolExecutionOptions } from '@distri/core';
import { LucyChatInput } from './LucyChatInput';
import { LucyWelcome, QuickAction } from './LucyWelcome';
import { LucyToolCalls } from './LucyToolCalls';
import { LucyPendingMessage } from './LucyPendingMessage';
import { LucyStreamingIndicator } from './LucyStreamingIndicator';
import { LucyMessageRenderer } from './messages/LucyMessageRenderer';
import { cn } from '@/lib/utils';

// Custom hooks for chat functionality
import { usePendingMessage, useFileAttachments, useAutoExpandTools } from '@/hooks/chat';

// ============================================================================
// Types
// ============================================================================

export interface LucyChatProps {
  /** Thread ID for the conversation */
  threadId: string;
  /** The agent instance */
  agent: Agent;
  /** External tools for the chat */
  externalTools?: DistriAnyTool[];
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
  /** Proactive prompt shown as Lucy's initial suggestion (displayed above quick actions) */
  proactivePrompt?: string | null;
  /** Auto-trigger prompt - automatically sends this message when chat is empty */
  autoTriggerPrompt?: string | null;
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
  proactivePrompt,
  autoTriggerPrompt,
}: LucyChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');

  // Voice input state
  const [isStreamingVoice, setIsStreamingVoice] = useState(false);

  // Use store for todos (handles todos_updated events from server)
  const todos = useChatStateStore((state) => state.todos);

  // Core chat hook from @distri/react
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
  const failAllPendingToolCalls = useChatStateStore((state) => state.failAllPendingToolCalls);

  // Custom hooks for chat functionality
  const { pendingMessage, queueOrSend } = usePendingMessage({
    isStreaming,
    sendMessage: async (parts) => {
      await sendMessage(parts);
    },
    onError,
  });

  const {
    files: attachedImages,
    addFiles: handleAddImages,
    removeFile: handleRemoveImage,
    clearFiles: clearAttachedImages,
  } = useFileAttachments();

  const { expandedTools, toggleExpansion: toggleToolExpansion } = useAutoExpandTools({
    toolCalls,
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming, toolCalls]);

  // ============================================================================
  // Auto-trigger Prompt Logic (Lucy-specific)
  // ============================================================================

  // Track the last auto-triggered prompt to prevent duplicate sends
  const lastAutoTriggeredPromptRef = useRef<string | null>(null);
  // Track if we're currently processing an auto-trigger to prevent races
  const autoTriggerPendingRef = useRef(false);

  // Auto-trigger prompt - send message automatically
  // Works for both initial proactive prompts and external triggers (like "Generate for topic")
  useEffect(() => {
    // When prompt is cleared, reset tracking to allow re-trigger of same prompt
    if (!autoTriggerPrompt) {
      lastAutoTriggeredPromptRef.current = null;
      autoTriggerPendingRef.current = false;
      return;
    }

    // Skip if this exact prompt was already triggered or is pending
    if (
      autoTriggerPrompt === lastAutoTriggeredPromptRef.current ||
      autoTriggerPendingRef.current
    ) {
      return;
    }

    // Check if there are pending tool calls (like ask_follow_up waiting for user input)
    const hasPending = hasPendingToolCalls();

    // Skip if chat is busy streaming/loading AND there are no pending tool calls to dismiss
    // If there ARE pending tool calls, we should dismiss them and proceed with the new prompt
    if ((isStreaming || isLoading) && !hasPending) {
      return;
    }

    // Mark as pending to prevent duplicate triggers from rapid effect re-runs
    autoTriggerPendingRef.current = true;
    lastAutoTriggeredPromptRef.current = autoTriggerPrompt;

    // Small delay to ensure component is fully mounted
    const timer = setTimeout(() => {
      // Clear old todos when starting a new operation
      useChatStateStore.getState().setTodos([]);

      // Dismiss any pending tool calls (e.g., ask_follow_up forms) before sending new message
      if (hasPending) {
        failAllPendingToolCalls('Dismissed by new prompt');
      }
      // Stop any active streaming before sending new message
      if (isStreaming) {
        stopStreaming();
        useChatStateStore.getState().resetStreamingStates();
      }
      sendMessage([{ part_type: 'text', data: autoTriggerPrompt }]);
      // Reset pending after send completes
      autoTriggerPendingRef.current = false;
    }, 100);

    return () => {
      clearTimeout(timer);
      autoTriggerPendingRef.current = false;
    };
  }, [autoTriggerPrompt, isStreaming, isLoading, sendMessage, stopStreaming, hasPendingToolCalls, failAllPendingToolCalls]);

  // Reset auto-trigger tracking when threadId changes (new chat)
  useEffect(() => {
    lastAutoTriggeredPromptRef.current = null;
    autoTriggerPendingRef.current = false;
  }, [threadId]);

  // ============================================================================
  // Handlers
  // ============================================================================

  // Handle sending a message (with pending queue support)
  const handleSend = useCallback(
    async (content: string | DistriPart[]) => {
      if (typeof content === 'string' && !content.trim()) return;
      if (Array.isArray(content) && content.length === 0) return;

      setInput('');
      clearAttachedImages();

      // Use the pending message hook's queueOrSend
      await queueOrSend(content);
    },
    [queueOrSend, clearAttachedImages]
  );

  // Handle stop streaming
  const handleStopStreaming = useCallback(() => {
    stopStreaming();
    useChatStateStore.getState().resetStreamingStates();
  }, [stopStreaming]);

  // Handle quick action click
  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      handleSend(action.label);
    },
    [handleSend]
  );

  // ============================================================================
  // Voice Input (Browser Speech API)
  // ============================================================================

  const startBrowserSpeechRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error('Speech recognition not supported in this browser');
      setIsStreamingVoice(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript.trim()) {
        setInput(transcript.trim());
      }
      setIsStreamingVoice(false);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsStreamingVoice(false);
    };

    recognition.onend = () => {
      setIsStreamingVoice(false);
    };

    recognition.start();
  }, []);

  const handleStartStreamingVoice = useCallback(() => {
    if (isStreamingVoice) return;
    setIsStreamingVoice(true);
    startBrowserSpeechRecognition();
  }, [isStreamingVoice, startBrowserSpeechRecognition]);

  // ============================================================================
  // Render
  // ============================================================================

  const showWelcome = messages.length === 0 && !isLoading;

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
          {showWelcome ? (
            <LucyWelcome
              quickActions={quickActions}
              onQuickAction={handleQuickAction}
              proactivePrompt={proactivePrompt}
            />
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
              <LucyToolCalls tools={externalTools} />

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

      {/* Todos Display - shows above input when there are active todos */}
      {todos.length > 0 && (
        <div className="border-t bg-background/50">
          <div className="max-w-3xl mx-auto px-4 py-2">
            <TodosDisplay todos={todos} autoCollapseOnDone />
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="bg-background/80 backdrop-blur">
        <LucyChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          onStop={handleStopStreaming}
          isStreaming={isStreaming}
          disabled={isLoading || hasPendingToolCalls()}
          placeholder={
            isStreaming ? 'Message will be queued...' : 'Ask Lucy to analyze your dataset'
          }
          // File attachments (images, PDFs, documents)
          attachedImages={attachedImages}
          onRemoveImage={handleRemoveImage}
          onAddImages={handleAddImages}
          // Voice input (always enabled - uses browser fallback if no speechToText API)
          voiceEnabled={true}
          onStartStreamingVoice={handleStartStreamingVoice}
          isStreamingVoice={isStreamingVoice}
        />
      </div>
    </div>
  );
}

export default LucyChat;
