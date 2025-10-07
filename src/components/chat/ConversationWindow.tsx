import React, { useCallback, useEffect } from 'react';
import { ChatConversation } from './ChatConversation';
import { ChatInput } from './ChatInput';
import { ModelSelector } from './ModelSelector';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';
import { useMessageSubmission } from '@/hooks/useMessageSubmission';
import { emitter } from '@/utils/eventEmitter';
import { XCircle } from 'lucide-react';
import { useConversationEvents } from '@/hooks/events/useConversationEvents';
import { ArrowsPointingInIcon, ArrowsPointingOutIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline';
import { Message } from '@/types/chat';

interface ChatWindowProps {
  threadId?: string;
  threadTitle?: string;
  modelName?: string;
  apiUrl: string;
  apiKey?: string;
  projectId?: string;
  widgetId?: string;
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
  onModelChange?: (modelId: string) => void;
}

export const ConversationWindow: React.FC<ChatWindowProps> = ({
  threadId,
  threadTitle,
  modelName,
  apiUrl,
  apiKey,
  projectId,
  widgetId,
  cost,
  inputTokens,
  outputTokens,
  onModelChange,
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
  } = ChatWindowConsumer();

  useEffect(() => {
    if(threadId) {
      clearMessages();
      refreshMessages();
    }
  }, [threadId])

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
      <div className="border-b border-border bg-card flex-shrink-0">
        {/* Model Selector */}
        <div className="p-4">
          <div className="max-w-md border border-border rounded-md px-3 py-2">
            <ModelSelector
              selectedModel={modelName || 'Select a model'}
              onModelChange={onModelChange}
            />
          </div>
        </div>

        {/* Cost and Tokens Display */}
        {threadId && (cost !== undefined || inputTokens !== undefined || outputTokens !== undefined) && (
          <div className="px-4 pb-3 flex items-center justify-between text-sm">
            {cost !== undefined && (
              <div className="flex items-center gap-2">
                <CurrencyDollarIcon className="w-4 h-4 text-teal-500" />
                <span className="text-muted-foreground">Cost</span>
                <span className="font-medium text-foreground">
                  {cost > 0 && cost < 0.0001 ? '<$0.0001' : `$${cost.toFixed(4)}`}
                </span>
              </div>
            )}
            {inputTokens !== undefined && (
              <div className="flex items-center gap-2">
                <ArrowsPointingInIcon className="w-4 h-4 text-blue-500" />
                <span className="text-muted-foreground">Input</span>
                <span className="font-medium text-foreground">{inputTokens.toLocaleString()} tokens</span>
              </div>
            )}
            {outputTokens !== undefined && (
              <div className="flex items-center gap-2">
                <ArrowsPointingOutIcon className="w-4 h-4 text-purple-500" />
                <span className="text-muted-foreground">Output</span>
                <span className="font-medium text-foreground">{outputTokens.toLocaleString()} tokens</span>
              </div>
            )}
          </div>
        )}
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