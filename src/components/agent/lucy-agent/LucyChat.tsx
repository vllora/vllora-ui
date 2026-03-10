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

import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { useChat, useChatStateStore, TodosDisplay } from '@distri/react';
import type { ToolRendererMap, DistriAnyTool } from '@distri/react';
import { Agent, DistriChatMessage, DistriMessage, DistriPart, ToolExecutionOptions } from '@distri/core';
import { LucyChatInput } from './LucyChatInput';
import { LucyWelcome, QuickAction } from './LucyWelcome';
import { LucyToolCalls } from './LucyToolCalls';
import { LucyPendingMessage } from './LucyPendingMessage';
import { LucyStreamingIndicator } from './LucyStreamingIndicator';
import { LucyTypingIndicator } from './LucyTypingIndicator';
import { LucyMessageRenderer } from './messages/LucyMessageRenderer';
import { LucyAvatar } from './LucyAvatar';
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
  /** Active section for context-aware chat placeholder */
  activeSection?: string;
  /** Status summary for existing datasets (rendered in welcome slot) */
  statusSummary?: React.ReactNode;
  /** Catch-up cards for session resume (completed jobs, failed jobs, pending decisions) */
  catchUpCards?: React.ReactNode;
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
// Helpers
// ============================================================================

function getPlaceholderForSection(section?: string): string {
  switch (section) {
    case 'records':
      return 'Ask Lucy about your training data...';
    case 'evaluator':
      return 'Ask Lucy to set up quality scoring...';
    case 'jobs':
      return 'Ask Lucy about training configuration...';
    case 'deploy':
      return 'Ask Lucy about deployment options...';
    case 'docs':
      return 'Ask Lucy about your documents...';
    case 'plan':
      return 'Ask Lucy to create or modify the plan...';
    default:
      return 'Ask Lucy to help with your dataset...';
  }
}

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
  activeSection,
  statusSummary,
  catchUpCards,
}: LucyChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');

  // Voice input state
  const [isStreamingVoice, setIsStreamingVoice] = useState(false);

  // Auto-analyzing indicator (shown before Lucy's first auto-analysis)
  const [isAutoAnalyzing, setIsAutoAnalyzing] = useState(false);

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

  // Error dismiss/retry state
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const showError = error && error.message !== dismissedError;

  // Find the last user message for retry
  const lastUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if ('role' in msg && msg.role === 'user') {
        const textPart = msg.parts.find((p: DistriPart) => p.part_type === 'text');
        return textPart?.data as string | undefined;
      }
    }
    return undefined;
  }, [messages]);

  const handleRetry = useCallback(() => {
    if (lastUserMessage) {
      setDismissedError(error?.message ?? null);
      sendMessage([{ part_type: 'text', data: lastUserMessage }]);
    }
  }, [lastUserMessage, error, sendMessage]);

  const handleDismissError = useCallback(() => {
    setDismissedError(error?.message ?? null);
  }, [error]);

  // Reset dismissed error when error changes to something new
  useEffect(() => {
    if (error && error.message !== dismissedError) {
      // New error appeared — don't auto-dismiss
    }
    if (!error) {
      setDismissedError(null);
    }
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Catch-up card presence (fresh threads mean no historical messages to split)
  const hasCatchUp = Boolean(catchUpCards);

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

    // Mark as pending to prevent duplicate triggers from rapid effect re-runs.
    // NOTE: lastAutoTriggeredPromptRef is set INSIDE the timer callback (after sendMessage),
    // not here. This prevents a race condition where a dependency change (e.g., sendMessage
    // reference updating during useChat initialization) cancels the timer via cleanup,
    // but the ref was already set — making the effect think the prompt was already sent.
    autoTriggerPendingRef.current = true;

    // Detect if this is an initial analysis prompt (longer delay to show indicator)
    const isAnalysisPrompt = messages.length === 0 && (
      autoTriggerPrompt.includes('analyze') || autoTriggerPrompt.includes('review')
    );

    // Show "reviewing" indicator for initial analysis
    if (isAnalysisPrompt) {
      setIsAutoAnalyzing(true);
    }

    // Longer delay for analysis prompts to let user see the "reviewing" indicator
    const timer = setTimeout(() => {
      setIsAutoAnalyzing(false);

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
      // Mark as triggered AFTER send — only now is it safe to deduplicate
      lastAutoTriggeredPromptRef.current = autoTriggerPrompt;
      autoTriggerPendingRef.current = false;
    }, isAnalysisPrompt ? 800 : 100);

    return () => {
      clearTimeout(timer);
      autoTriggerPendingRef.current = false;
      setIsAutoAnalyzing(false);
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

  // Handle quick action click — send structured prompt if available, fallback to label
  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      handleSend(action.prompt || action.label);
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

  const showWelcome = messages.length === 0 && !isLoading && !isAutoAnalyzing && !hasCatchUp;

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-3 py-2 space-y-1.5">
          {showWelcome ? (
            <LucyWelcome
              quickActions={quickActions}
              onQuickAction={handleQuickAction}
              proactivePrompt={proactivePrompt}
              statusSummary={statusSummary}
            />
          ) : hasCatchUp && messages.length === 0 ? (
            /* Catch-up landing: cards shown on fresh thread for returning users */
            <div className="space-y-2 py-1.5">
              {catchUpCards}
            </div>
          ) : isAutoAnalyzing && messages.length === 0 ? (
            /* Lucy "reviewing" indicator before first auto-analysis */
            <div className="flex flex-col items-start gap-1 pt-2">
              <div className="flex items-center gap-1.5">
                <LucyAvatar size="xs" />
                <span className="text-xs font-medium text-muted-foreground">Lucy</span>
              </div>
              <div className="border-l-2 border-[rgb(var(--theme-500))] pl-3 py-1">
                <LucyTypingIndicator />
                <p className="text-xs text-muted-foreground mt-0.5">Lucy is reviewing your experiment...</p>
              </div>
            </div>
          ) : (
            <>
              {/* All messages — single flat list (fresh thread, no split needed) */}
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

              {/* Streaming indicator — hidden when tool call spinners are visible */}
              <LucyStreamingIndicator
                isStreaming={isStreaming}
                hideWhenToolsActive={Array.from(toolCalls.values()).some(
                  (tc) => tc.status === 'running' || tc.status === 'pending'
                )}
              />

              {/* Render pending message */}
              <LucyPendingMessage pendingMessage={pendingMessage} />

              {/* Error display with retry/dismiss */}
              {showError && (
                <div className="border-l-2 border-destructive pl-3 py-1.5 space-y-1.5">
                  <p className="text-destructive text-sm">{error.message}</p>
                  <div className="flex items-center gap-2">
                    {lastUserMessage && (
                      <button
                        onClick={handleRetry}
                        className="text-xs font-medium text-destructive hover:text-destructive/80 transition-colors"
                      >
                        Retry
                      </button>
                    )}
                    <button
                      onClick={handleDismissError}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
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

      {/* Pending message indicator */}
      {pendingMessage && pendingMessage.length > 0 && (
        <div className="px-4 py-1.5 bg-amber-500/10 border-t border-amber-500/20">
          <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
            Message queued — will send when Lucy finishes
          </p>
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
            isStreaming ? 'Message Lucy (queued)...' : getPlaceholderForSection(activeSection)
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
