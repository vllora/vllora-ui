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
 * Compares two messages for equality based on role, content, and content_array
 */
const areMessagesEqual = (msg1: any, msg2: any): boolean => {
  if (msg1.role !== msg2.role) return false;
  if (msg1.content !== msg2.content) return false;

  // Compare content_array
  const arr1 = msg1.content_array || [];
  const arr2 = msg2.content_array || [];

  if (arr1.length !== arr2.length) return false;

  return arr1.every((item1: any, idx: number) => {
    const item2 = arr2[idx];
    return JSON.stringify(item1) === JSON.stringify(item2);
  });
};

/**
 * Checks if spanA's messages are completely included in spanB (in the same order)
 * Returns true if spanB contains all of spanA's messages as a contiguous subsequence
 */
const isSubsetOfMessages = (spanA: SpanWithMessages, spanB: SpanWithMessages): boolean => {
  const messagesA = spanA.messages;
  const messagesB = spanB.messages;

  if (messagesA.length === 0) return true;
  if (messagesA.length > messagesB.length) return false;

  // Try to find messagesA as a contiguous subsequence in messagesB
  for (let i = 0; i <= messagesB.length - messagesA.length; i++) {
    let allMatch = true;
    for (let j = 0; j < messagesA.length; j++) {
      if (!areMessagesEqual(messagesA[j], messagesB[i + j])) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return true;
  }

  return false;
};

/**
 * Extracts and deduplicates spans with messages from the hierarchy
 * Within the same run_id, removes spans whose messages are completely included
 * in another span's messages (in the same order)
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

  // Group spans by run_id
  const spansByRunId = new Map<string, SpanWithMessages[]>();

  result.forEach((span) => {
    const runId = span.run_id || `unique:${span.span_id}`;
    if (!spansByRunId.has(runId)) {
      spansByRunId.set(runId, []);
    }
    spansByRunId.get(runId)!.push(span);
  });

  // Within each run_id group, remove spans that are subsets of other spans
  const spansToKeep = new Set<SpanWithMessages>();

  spansByRunId.forEach((spans) => {
    if (spans.length === 1) {
      // Only one span for this run_id, keep it
      spansToKeep.add(spans[0]);
      return;
    }

    // Check each span to see if it's a subset of any other span
    spans.forEach((spanA) => {
      let isSubset = false;

      for (const spanB of spans) {
        if (spanA === spanB) continue;

        // If spanA's messages are completely included in spanB, mark spanA as subset
        if (isSubsetOfMessages(spanA, spanB)) {
          isSubset = true;
          break;
        }
      }

      // Keep spanA only if it's not a subset of any other span
      if (!isSubset) {
        spansToKeep.add(spanA);
      }
    });
  });

  // Filter result to preserve original order
  return result.filter((span) => spansToKeep.has(span));
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
  console.log("=== validMessages", validMessages);

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