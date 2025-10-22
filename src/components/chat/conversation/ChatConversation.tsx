import React, { useRef, useCallback } from 'react';
import { Bot, ArrowDown } from 'lucide-react';
import { useInViewport } from 'ahooks';
import { HierarchicalMessageSpanItem } from './HierarchiMessageItem';
import { MessageStructure } from '@/utils/message-structure-from-span';

interface ChatConversationProps {
  messages: MessageStructure[];
  isLoading?: boolean;
  messagesEndRef?: React.RefObject<HTMLDivElement>;
  scrollToBottom?: () => void;
}

const ChatConversationComponent: React.FC<ChatConversationProps> = ({
  messages,
  isLoading = false,
  messagesEndRef: externalMessagesEndRef,
  scrollToBottom: externalScrollToBottom,
}) => {
  const internalMessagesEndRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = externalMessagesEndRef || internalMessagesEndRef;
  const [inViewport] = useInViewport(messagesEndRef);

  // const validMessages = extractValidDisplayMessages(messages);
  const scrollToBottom = useCallback(() => {
    if (externalScrollToBottom) {
      externalScrollToBottom();
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [externalScrollToBottom, messagesEndRef]);

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
      {messages.map((message) => (
        <HierarchicalMessageSpanItem key={`message-${message.span_id}`} messageStructure={message} />
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

// Memoize with custom comparison to only re-render when messages array structure changes
export const ChatConversation = React.memo(ChatConversationComponent, (prevProps, nextProps) => {
  // Re-render if isLoading changes
  if (prevProps.isLoading !== nextProps.isLoading) return false;

  // Re-render if messagesEndRef changes
  if (prevProps.messagesEndRef !== nextProps.messagesEndRef) return false;

  // Re-render if messages array length changes
  if (prevProps.messages.length !== nextProps.messages.length) return false;

  // Re-render if any message span_id changes (structure change)
  for (let i = 0; i < prevProps.messages.length; i++) {
    if (prevProps.messages[i].span_id !== nextProps.messages[i].span_id) {
      return false;
    }
  }

  // Don't re-render (props are equal)
  return true;
});