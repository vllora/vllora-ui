import React, { useRef } from 'react';
import { Bot, ArrowDown } from 'lucide-react';
import { useInViewport } from 'ahooks';
import { SpanWithMessages } from '@/utils/span-to-message';
import { HierarchicalSpanItem } from './HierarchicalMessageItem';

interface ChatConversationProps {
  messages: SpanWithMessages[];
  isLoading?: boolean;
  messagesEndRef?: React.RefObject<HTMLDivElement>;
  scrollToBottom?: () => void;
}

/**
 * Extracts and deduplicates spans with messages from the hierarchy
 * When duplicate run_ids are found, keeps the span with the most messages
 * Preserves original order of appearance
 */
const extractValidDisplayMessages = (messages: SpanWithMessages[], level: number = 0): SpanWithMessages[] => {
  let result: SpanWithMessages[] = [];

  // Recursively collect all spans with messages
  for (const spanWithMessages of messages) {
    if (spanWithMessages.messages.length > 0) {
      result.push(spanWithMessages);
    }
    if (spanWithMessages.children && spanWithMessages.children.length > 0) {
      result.push(...extractValidDisplayMessages(spanWithMessages.children, level + 1));
    }
  }

  // Deduplicate by run_id, keeping the span with most messages
  const runIdMap = new Map<string, { span: SpanWithMessages; index: number }>();

  result.forEach((spanWithMessages, index) => {
    const runId = spanWithMessages.run_id;

    if (!runId) {
      // If no run_id, always keep it (can't deduplicate)
      return;
    }

    const existing = runIdMap.get(runId);

    if (!existing) {
      // First occurrence of this run_id
      runIdMap.set(runId, { span: spanWithMessages, index });
    } else {
      // Duplicate found - keep the one with more messages
      const existingMessageCount = existing.span.messages.length;
      const currentMessageCount = spanWithMessages.messages.length;

      if (currentMessageCount > existingMessageCount) {
        // Replace with span that has more messages, but keep original index for ordering
        runIdMap.set(runId, { span: spanWithMessages, index: existing.index });
      }
      // If equal or less, keep the existing one (first occurrence wins)
    }
  });

  // Filter result to only include spans that are in the map
  // This preserves original order while removing duplicates
  const keptSpans = new Set(Array.from(runIdMap.values()).map(v => v.span));

  return result.filter((span) => {
    // Keep spans without run_id (can't be duplicates)
    if (!span.run_id) return true;

    // Keep spans that are in our deduplicated map
    return keptSpans.has(span);
  });
}

export const ChatConversation: React.FC<ChatConversationProps> = ({
  messages,
  isLoading = false,
  messagesEndRef: externalMessagesEndRef,
  scrollToBottom: externalScrollToBottom,
}) => {
  const internalMessagesEndRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = externalMessagesEndRef || internalMessagesEndRef;
  const [inViewport] = useInViewport(messagesEndRef);
  const validMessages = extractValidDisplayMessages(messages);
  console.log("===== validMessages", validMessages);
  

  const scrollToBottom = () => {
    if (externalScrollToBottom) {
      externalScrollToBottom();
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <Bot className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-muted-foreground mb-2">
            Start a conversation
          </h3>
          <p className="text-muted-foreground/70 text-sm">
            Type a message below to begin chatting
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 relative">
      {validMessages.map((spanWithMessages) => (
        <HierarchicalSpanItem key={`${spanWithMessages.span_id}-${spanWithMessages.run_id}`} spanWithMessages={spanWithMessages} showRunIdHeader={true} />
      ))}

      {isLoading && (
          <div className="flex gap-4 justify-start">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
            </div>
            <div className="bg-secondary rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                  <div
                    className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <div
                    className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

      <div ref={messagesEndRef} className="h-[50px]" />

      {!inViewport && (
        <div className="sticky bottom-4 w-full flex justify-center mt-2 mb-2">
          <button
            onClick={scrollToBottom}
            className="cursor-pointer z-10 rounded-full bg-neutral-900 border border-neutral-800 w-10 h-10 flex items-center justify-center shadow-lg hover:bg-neutral-800 transition-all duration-200"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="w-5 h-5 text-white" />
          </button>
        </div>
      )}
    </div>
  );
};