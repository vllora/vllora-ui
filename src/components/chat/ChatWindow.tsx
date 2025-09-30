import React, { useCallback, useEffect } from 'react';
import { ChatConversation } from './ChatConversation';
import { ChatInput } from './ChatInput';
import { ModelSelector } from './ModelSelector';
import { useChatState } from '@/hooks/useChatState';
import { useMessageSubmission } from '@/hooks/useMessageSubmission';
import { emitter } from '@/utils/eventEmitter';
import { XCircle } from 'lucide-react';

interface ChatWindowProps {
  threadId?: string;
  modelName?: string;
  apiUrl: string;
  apiKey?: string;
  projectId?: string;
  widgetId?: string;
  onModelChange?: (modelId: string) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  threadId: initialThreadId,
  modelName,
  apiUrl,
  apiKey,
  projectId,
  widgetId,
  onModelChange,
}) => {
  const chatState = useChatState({ initialMessages: [] });

  const {
    messages,
    currentInput,
    setCurrentInput,
    typing,
    error,
    setError,
    setMessages,
    setThreadId,
    threadId,
  } = chatState;

  const {
    submitMessageFn: handleSubmit,
    messagesEndRef,
    terminateChat,
    scrollToBottom,
  } = useMessageSubmission(
    {
      apiUrl,
      apiKey,
      projectId,
      modelName,
      widgetId,
    },
    chatState
  );

  const onSubmitWrapper = useCallback(
    (inputProps: {
      inputText: string;
      files: any[];
      searchToolEnabled?: boolean;
      otherTools?: string[];
    }) => {
      return handleSubmit(inputProps);
    },
    [handleSubmit]
  );

  // Handle external events
  useEffect(() => {
    const handleTerminate = (input: { threadId: string; widgetId?: string }) => {
      if (
        input.threadId === threadId ||
        (input.widgetId && input.widgetId === widgetId)
      ) {
        terminateChat();
        setError('Chat terminated by user');
      }
    };
    emitter.on('langdb_chatTerminate', handleTerminate);
    return () => {
      emitter.off('langdb_chatTerminate', handleTerminate);
    };
  }, [terminateChat, setError, threadId, widgetId]);

  useEffect(() => {
    const handleClearChat = (input: { threadId?: string; widgetId?: string }) => {
      if (
        input.threadId === threadId ||
        (input.widgetId && input.widgetId === widgetId)
      ) {
        terminateChat();
        setMessages([]);
        setThreadId(initialThreadId);
      }
    };
    emitter.on('langdb_clearChat', handleClearChat);
    return () => {
      emitter.off('langdb_clearChat', handleClearChat);
    };
  }, [terminateChat, threadId, widgetId, setMessages, setThreadId, initialThreadId]);

  useEffect(() => {
    const handleScrollToBottom = (input: {
      threadId?: string;
      widgetId?: string;
    }) => {
      if (
        messages &&
        messages.length > 0 &&
        ((input.threadId === threadId && input.threadId) ||
          (input.widgetId && input.widgetId === widgetId))
      ) {
        scrollToBottom();
      }
    };
    emitter.on('langdb_chat_scrollToBottom', handleScrollToBottom);
    return () => {
      emitter.off('langdb_chat_scrollToBottom', handleScrollToBottom);
    };
  }, [messages, threadId, scrollToBottom, widgetId]);

  useEffect(() => {
    const handleExternalSubmit = ({
      inputText,
      files,
      searchToolEnabled,
      otherTools,
    }: {
      inputText: string;
      files: any[];
      searchToolEnabled?: boolean;
      otherTools?: string[];
    }) => {
      setCurrentInput(inputText);
      onSubmitWrapper({ inputText, files, searchToolEnabled, otherTools });
    };
    emitter.on('langdb_input_chatSubmit', handleExternalSubmit);

    return () => {
      emitter.off('langdb_input_chatSubmit', handleExternalSubmit);
    };
  }, [onSubmitWrapper, setCurrentInput]);

  // Ensure typing indicator is visible by scrolling to bottom when typing state changes
  useEffect(() => {
    if (typing) {
      setTimeout(() => scrollToBottom(), 100);
    }
  }, [typing, scrollToBottom]);

  return (
    <>
      {/* Chat Header */}
      <div className="border-b border-border p-4 bg-card flex-shrink-0">
        <h2 className="text-lg font-semibold text-card-foreground">
          {threadId ? `Thread: ${threadId}` : 'New conversation'}
        </h2>

        {/* Model Selector */}
        <ModelSelector
          selectedModel={modelName || 'Select a model'}
          onModelChange={onModelChange}
        />
      </div>

      {/* Chat Conversation */}
      <ChatConversation
        messages={messages}
        isLoading={typing}
        messagesEndRef={messagesEndRef as React.RefObject<HTMLDivElement>}
        scrollToBottom={scrollToBottom}
      />

      {/* Error Display */}
      {error && (
        <div className="mx-4 mb-2 bg-red-900/20 border border-red-500/30 flex p-3 rounded-lg items-center justify-between shadow-md">
          <div className="flex flex-1 items-center gap-2">
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="text-red-400 text-sm break-words">{error}</span>
          </div>
          <button
            onClick={() => setError(undefined)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Chat Input */}
      <div className="flex-shrink-0">
        <ChatInput
          onSubmit={(props) => {
            emitter.emit('langdb_input_chatSubmit', props);
            setCurrentInput('');
            return Promise.resolve();
          }}
          currentInput={currentInput}
          setCurrentInput={setCurrentInput}
          disabled={typing}
        />
      </div>
    </>
  );
};