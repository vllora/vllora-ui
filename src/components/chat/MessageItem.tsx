import React from 'react';
import { Message, MessageType } from '@/types/chat';
import { HumanMessage } from './messages/HumanMessage';
import { AiMessage } from './messages/AiMessage';
import { SystemMessage } from './messages/System';
import { ToolMessage } from './messages/ToolMessage';

interface MessageItemProps {
  message: Message;
  isTyping?: boolean;
}

/**
 * MessageItem component displays chat messages with appropriate styling based on message type
 */
const MessageItemComponent: React.FC<MessageItemProps> = ({ message, isTyping }) => {
  const isHumanMessage = message.type === MessageType.HumanMessage || message.type === MessageType.UserMessage;

  return (
    <article
      className={`
        flex mb-4 group
        ${isHumanMessage ? 'justify-end' : 'justify-start'}
        transition-all duration-200 ease-in-out
      `}
      role="listitem"
      aria-label={`${isHumanMessage ? 'Your' : 'Assistant'} message`}
    >
      <div
        className={`
          max-w-[85%] sm:max-w-[75%] text-sm
          ${isHumanMessage ? 'order-1' : 'order-2'}
        `}
      >
       {isHumanMessage ? (
          <HumanMessage message={message} />
        ) : message.type === MessageType.SystemMessage ? (
          <SystemMessage
            msg={message}
          />
        ) : message.type === MessageType.ToolMessage ? (
          <ToolMessage
          message={message} isTyping={isTyping}
          />
        ) : (
          <AiMessage
          message={message} isTyping={isTyping}
          />
        )}
      </div>
    </article>
  );
};

export const MessageItem = React.memo(MessageItemComponent, (prev, next) => {
    // Fast path: if the message object reference is the same, skip all checks
    if (prev.message === next.message && prev.isTyping === next.isTyping) {
        return true;
    }

    // Critical fields that affect rendering (ordered by likelihood of change)
    if (prev.message.id !== next.message.id) return false;
    if (prev.message.content !== next.message.content) return false;
    if (prev.isTyping !== next.isTyping) return false;
    if (prev.message.is_loading !== next.message.is_loading) return false;

    // Type and role changes
    if (prev.message.type !== next.message.type) return false;
    if (prev.message.role !== next.message.role) return false;

    // Interactive content (likely to change during streaming/updates)
    if (prev.message.content_array !== next.message.content_array) return false;
    if (prev.message.tool_calls !== next.message.tool_calls) return false;
    if (prev.message.tool_call_id !== next.message.tool_call_id) return false;

    // Metadata (less likely to change but important for display)
    if (prev.message.metrics !== next.message.metrics) return false;
    if (prev.message.model_name !== next.message.model_name) return false;
    if (prev.message.files !== next.message.files) return false;
    if (prev.message.children !== next.message.children) return false;

    // Span data (for tracing/debugging views)
    if (prev.message.span_id !== next.message.span_id) return false;
    if (prev.message.span !== next.message.span) return false;

    return true;
});
