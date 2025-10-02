import React from 'react';
import { Message, MessageType } from '@/types/chat';
import { HumanMessage } from './messages/HumanMessage';
import { AiMessage } from './messages/AiMessage';
import { SystemMessage } from './messages/System';

interface MessageItemProps {
  message: Message;
  isTyping?: boolean;
}

/**
 * MessageItem component displays chat messages with appropriate styling based on message type
 */
export const MessageItem: React.FC<MessageItemProps> = ({ message, isTyping }) => {
  const isHumanMessage = message.type === MessageType.HumanMessage;

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
        ) : (
          <AiMessage
          message={message} isTyping={isTyping}
          />
        )}
      </div>
    </article>
  );
};
