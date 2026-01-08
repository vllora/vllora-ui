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
import { LucyChatInput, AttachedImage } from './LucyChatInput';
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

  // Image attachments state
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);

  // Voice input state
  const [isStreamingVoice, setIsStreamingVoice] = useState(false);
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

      // Clear attached images after sending
      attachedImages.forEach((img) => URL.revokeObjectURL(img.preview));
      setAttachedImages([]);

      // If streaming, add to pending message parts instead of sending immediately
      if (isStreaming) {
        const newParts = contentToParts(content);
        setPendingMessage((prev) => (prev ? [...prev, ...newParts] : newParts));
      } else {
        await sendMessage(content);
      }
    },
    [sendMessage, isStreaming, contentToParts, attachedImages]
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

  // Helper to read file as base64
  const readFileAsBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix (e.g., "data:image/png;base64,")
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  // Handle adding images
  const handleAddImages = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    for (const file of imageFiles) {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 11);
      const preview = URL.createObjectURL(file);
      const base64 = await readFileAsBase64(file);
      const newImage: AttachedImage = {
        id,
        file,
        preview,
        base64,
        mimeType: file.type || 'image/png',
        name: file.name,
      };
      setAttachedImages((prev) => [...prev, newImage]);
    }
  }, [readFileAsBase64]);

  // Handle removing an image
  const handleRemoveImage = useCallback((id: string) => {
    setAttachedImages((prev) => {
      const image = prev.find((img) => img.id === id);
      if (image) {
        URL.revokeObjectURL(image.preview);
      }
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  // Start browser's Web Speech API
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

  // Handle starting streaming voice input
  // Uses browser's Web Speech API directly (more reliable than WebSocket-based API)
  const handleStartStreamingVoice = useCallback(() => {
    if (isStreamingVoice) return;

    setIsStreamingVoice(true);
    startBrowserSpeechRecognition();
  }, [isStreamingVoice, startBrowserSpeechRecognition]);

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
      <div className="bg-background/80 backdrop-blur">
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
            // Image attachments
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
