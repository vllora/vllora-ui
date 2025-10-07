import React, { useCallback, useEffect } from 'react';
import { ChatConversation } from './ChatConversation';
import { ChatInput } from './ChatInput';
import { ModelSelector } from './ModelSelector';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';
import { useMessageSubmission } from '@/hooks/useMessageSubmission';
import { emitter } from '@/utils/eventEmitter';
import { XCircle } from 'lucide-react';
import { useConversationEvents } from '@/hooks/events/useConversationEvents';
import { Message } from '@/types/chat';
import { ConversationMetrics } from './ConversationMetrics';

interface ChatWindowProps {
  threadId?: string;
  threadTitle?: string;
  modelName?: string;
  apiUrl: string;
  apiKey?: string;
  projectId?: string;
  widgetId?: string;
  onModelChange?: (modelId: string) => void;
  isDraft?: boolean;
}

export const ConversationWindow: React.FC<ChatWindowProps> = ({
  threadId,
  threadTitle,
  modelName,
  apiUrl,
  apiKey,
  projectId,
  widgetId,
  onModelChange,
  isDraft = false,
}) => {
  // Get all state from context
  const {
    serverMessages,
    clearMessages,
    setIsChatProcessing,
    refreshMessages,
    currentInput,
    setCurrentInput,
    typing,
    setTyping,
    error,
    setError,
    messageId,
    setMessageId,
    traceId,
    setTraceId,
    appendUsage,
    conversationMetrics,
  } = ChatWindowConsumer();

  useEffect(() => {
    if (threadId && !isDraft) {
      clearMessages();
      refreshMessages();
    } else if (threadId && isDraft) {
      clearMessages();
    }
  }, [threadId, isDraft])

  useConversationEvents({
    currentProjectId: projectId || '',
    currentThreadId: threadId || '',
  });

  const {
    submitMessageFn: handleSubmit,
    messagesEndRef,
    terminateChat,
    scrollToBottom,
  } = useMessageSubmission({
    apiUrl,
    apiKey,
    projectId,
    modelName,
    widgetId,
    threadId,
    threadTitle,
    setCurrentInput,
    setTyping,
    setError,
    setMessageId,
    setTraceId,
    appendUsage,
    messageId,
    traceId,
  });

  const onSubmitWrapper = useCallback(
    (inputProps: {
      inputText: string;
      files: any[];
      initialMessages?: Message[];
      searchToolEnabled?: boolean;
      otherTools?: string[];
      threadId?: string;
      threadTitle?: string;
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
    const handlerChatWindowEvent = (input: { threadId?: string; widgetId?: string; state?: string }) => {
      if (threadId && widgetId && input.widgetId === widgetId) {
        if (input.state === 'SubmitStart' || input.state === 'Processing') {
          setIsChatProcessing(true);

        } else {
          setIsChatProcessing(false);
        }
      }
    };
    emitter.on('langdb_chatWindow', handlerChatWindowEvent);
    return () => {
      emitter.off('langdb_chatWindow', handlerChatWindowEvent);
    }
  }, [threadId, widgetId])

  useEffect(() => {
    const handleClearChat = (input: { threadId?: string; widgetId?: string }) => {
      if (
        input.threadId === threadId ||
        (input.widgetId && input.widgetId === widgetId)
      ) {
        terminateChat();
        clearMessages();
      }
    };
    emitter.on('langdb_clearChat', handleClearChat);
    return () => {
      emitter.off('langdb_clearChat', handleClearChat);
    };
  }, [terminateChat, threadId, widgetId, clearMessages]);

  useEffect(() => {
    const handleScrollToBottom = (input: {
      threadId?: string;
      widgetId?: string;
    }) => {
      if (
        serverMessages &&
        serverMessages.length > 0 &&
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
  }, [serverMessages, threadId, scrollToBottom, widgetId]);

  useEffect(() => {
    const handleExternalSubmit = ({
      inputText,
      files,
      searchToolEnabled,
      otherTools,
      threadTitle,
    }: {
      inputText: string;
      files: any[];
      searchToolEnabled?: boolean;
      otherTools?: string[];
      threadTitle?: string;
    }) => {
      setCurrentInput(inputText);
      onSubmitWrapper({ inputText, files, searchToolEnabled, otherTools, threadId, threadTitle, initialMessages: serverMessages });
    };
    emitter.on('langdb_input_chatSubmit', handleExternalSubmit);

    return () => {
      emitter.off('langdb_input_chatSubmit', handleExternalSubmit);
    };
  }, [onSubmitWrapper, setCurrentInput, threadId, serverMessages]);

  // Ensure typing indicator is visible by scrolling to bottom when typing state changes
  useEffect(() => {
    if (typing) {
      setTimeout(() => scrollToBottom(), 100);
    }
  }, [typing, scrollToBottom]);

  return (
    <>
      {/* Chat Header */}
      <div className="bg-card flex-shrink-0">
        {/* Model Selector - Top row aligned with Project Dropdown */}
        <div className="h-16 px-4 border-b border-border flex items-center bg-card/95 backdrop-blur-xl">
          <div className="max-w-md border border-border rounded-md px-3 py-2">
            <ModelSelector
              selectedModel={modelName || 'Select a model'}
              onModelChange={onModelChange}
            />
          </div>
        </div>

        {/* Cost and Tokens Display - Second row aligned with New Chat button */}
        {!isDraft && threadId && conversationMetrics && (conversationMetrics.cost || conversationMetrics.inputTokens || conversationMetrics.outputTokens || conversationMetrics.duration) && <ConversationMetrics
          threadId={threadId}
          cost={conversationMetrics.cost}
          inputTokens={conversationMetrics.inputTokens}
          outputTokens={conversationMetrics.outputTokens}
          duration={conversationMetrics.duration}
        />}
      </div>

      {/* Chat Conversation */}
      <ChatConversation
        messages={serverMessages}
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
          threadTitle={threadTitle}
        />
      </div>
    </>
  );
};