import React, { useEffect, useRef } from 'react';
import { Bot, User, ArrowDown } from 'lucide-react';
import { Message, MessageType } from '@/types/chat';
import { useInViewport } from 'ahooks';
import { MessageDisplay } from './MessageDisplay';

interface ChatConversationProps {
  messages: Message[];
  isLoading?: boolean;
  messagesEndRef?: React.RefObject<HTMLDivElement>;
  scrollToBottom?: () => void;
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

  useEffect(() => {
    if (externalScrollToBottom) {
      externalScrollToBottom();
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, externalScrollToBottom, messagesEndRef]);

  const scrollToBottom = () => {
    if (externalScrollToBottom) {
      externalScrollToBottom();
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
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
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex gap-4 ${
            message.role === 'user' ? 'justify-end' : 'justify-start'
          }`}
        >
          {message.role === 'assistant' && (
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
            </div>
          )}

          <div
            className={`max-w-[70%] rounded-2xl px-4 py-3 ${
              message.role === 'user'
                ? 'bg-muted text-foreground border border-border'
                : 'bg-secondary text-secondary-foreground'
            }`}
          >
            {message.files && message.files.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {message.files.map((file, index) => (
                  <div key={index} className="relative">
                    {file.type.startsWith('image/') && file.preview && (
                      <img
                        src={file.preview}
                        alt={file.name}
                        className="max-w-xs rounded-lg"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="text-sm break-words">
              {message.role === 'user' ? (
                <p className="whitespace-pre-wrap">{message.content}</p>
              ) : (
                <MessageDisplay message={message.content} />
              )}
            </div>
            <p className="text-xs mt-2 text-muted-foreground">
              {formatTime(message.timestamp)}
            </p>
          </div>

          {message.role === 'user' && (
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      ))}

      {isLoading &&
        (messages.length === 0 ||
          messages[messages.length - 1].type !== MessageType.AIMessage) && (
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
                <span className="text-sm text-muted-foreground">Thinking…</span>
              </div>
            </div>
          </div>
        )}

      <div ref={messagesEndRef} className="h-1" />

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