import { createContext, useContext, ReactNode, useState, useCallback } from 'react';
import { useRequest } from 'ahooks';
import { toast } from 'sonner';
import { queryMessages } from '@/services/messages-api';
import { Message } from '@/types/chat';

interface ChatWindowContextType {
  messages: Message[];
  isLoading: boolean;
  error: Error | undefined;
  addMessage: (message: Message) => void;
  clearMessages: () => void;
  refreshMessages: () => void;
}


const ChatWindowContext = createContext<ChatWindowContextType | undefined>(undefined);

interface ChatWindowProviderProps {
  children: ReactNode;
  threadId: string;
  projectId: string;
}

export function ChatWindowProvider({ children, threadId, projectId }: ChatWindowProviderProps) {
  // Use ahooks useRequest for fetching messages
  const { data, loading: isLoading, error, run: refreshMessages } = useRequest(
    async () => {
      if (!threadId || !projectId) {
        return [];
      }
      const response = await queryMessages(projectId, threadId, {
        order_by: [['created_at', 'asc']],
        limit: 100,
        offset: 0,
      });
      console.log('=== ChatWindowContext: Fetched messages', response);
      return response;
    },
    {
      refreshDeps: [threadId, projectId],
      onError: (err) => {
        toast.error('Failed to load messages', {
          description: err.message || 'An error occurred while loading messages',
        });
      },
      onSuccess: (response) => {
        console.log('ChatWindowContext: Messages loaded successfully', response);
      },
    }
  );

  // Map API messages to local Message type
  const messages = data || [];

  const addMessage = useCallback((_message: Message) => {
    // TODO: Implement optimistic message adding if needed
  }, []);

  const clearMessages = useCallback(() => {
    // Clear messages by refreshing with empty result
    refreshMessages();
  }, [refreshMessages]);

  const value: ChatWindowContextType = {
    messages,
    isLoading,
    error,
    addMessage,
    clearMessages,
    refreshMessages,
  };

  return <ChatWindowContext.Provider value={value}>{children}</ChatWindowContext.Provider>;
}

export function ChatWindowConsumer() {
  const context = useContext(ChatWindowContext);
  if (context === undefined) {
    throw new Error('ChatWindowConsumer must be used within a ChatWindowProvider');
  }
  return context;
}
