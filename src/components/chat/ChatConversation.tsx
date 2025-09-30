import React, { useEffect, useRef } from 'react';
import { Bot, User } from 'lucide-react';
import { Message } from '@/types/chat';

interface ChatConversationProps {
  messages: Message[];
  isLoading?: boolean;
}

export const ChatConversation: React.FC<ChatConversationProps> = ({
  messages,
  isLoading = false,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex gap-4 ${
            message.role === 'user' ? 'justify-end' : 'justify-start'
          }`}
        >
          {message.role === 'assistant' && (
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-emerald-600 dark:bg-emerald-600 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
            </div>
          )}

          <div
            className={`max-w-[70%] rounded-2xl px-4 py-3 ${
              message.role === 'user'
                ? 'bg-emerald-600 dark:bg-emerald-600 text-white'
                : 'bg-secondary text-secondary-foreground'
            }`}
          >
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>
            <p
              className={`text-xs mt-2 ${
                message.role === 'user' ? 'text-emerald-100 dark:text-emerald-200' : 'text-muted-foreground'
              }`}
            >
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

      {isLoading && (
        <div className="flex gap-4 justify-start">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-emerald-600 dark:bg-emerald-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="bg-secondary rounded-2xl px-4 py-3">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce delay-100" />
              <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce delay-200" />
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
};