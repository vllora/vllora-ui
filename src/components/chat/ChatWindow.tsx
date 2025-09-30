import React from 'react';
import { ChatConversation } from './ChatConversation';
import { ChatInput } from './ChatInput';
import { ModelSelector } from './ModelSelector';
import { Thread } from '@/types/chat';

interface ChatWindowProps {
  thread: Thread;
  isLoading: boolean;
  onSendMessage: (content: string) => void;
  onModelChange?: (modelId: string) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  thread,
  isLoading,
  onSendMessage,
  onModelChange,
}) => {
  return (
    <>
      {/* Chat Header */}
      <div className="border-b border-border p-4 bg-card flex-shrink-0">
        <h2 className="text-lg font-semibold text-card-foreground">
          {thread.title || 'New conversation'}
        </h2>

        {/* Model Selector */}
        <ModelSelector
          selectedModel={thread.model}
          onModelChange={onModelChange}
        />
      </div>

      {/* Chat Conversation */}
      <ChatConversation
        messages={thread.messages}
        isLoading={isLoading}
      />

      {/* Chat Input */}
      <div className="flex-shrink-0">
        <ChatInput
          onSendMessage={onSendMessage}
          disabled={isLoading}
        />
      </div>
    </>
  );
};