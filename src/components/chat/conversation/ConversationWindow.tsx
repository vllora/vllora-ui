import React, { useCallback, useEffect } from 'react';
import { ChatConversation } from './ChatConversation';
import { ChatInput } from './ChatInput';
import { ConversationHeader } from './ConversationHeader';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';
import { useMessageSubmission } from '@/hooks/useMessageSubmission';
import { emitter } from '@/utils/eventEmitter';
import { XCircle } from 'lucide-react';
import { ModalProvider } from '@/contexts/ModalContext';
import { ModalManager } from '@/components/modals/ModalManager';
import { useConversationEvents } from '@/hooks/events/useConversationEvents';
import { Message } from '@/types/chat';
import { extractMessageFromApiInvokeSpan } from '@/utils/span-to-message';
import { McpServerConfig } from '@/services/mcp-api';
import { ProviderConfigDialog } from '../traces/model-selector/ProviderConfigDialog';
import { MultiProviderConfigDialog } from '../traces/model-selector/MultiProviderConfigDialog';
import { CurrentAppConsumer } from '@/contexts/CurrentAppContext';

interface ChatWindowProps {
  threadId?: string;
  threadTitle?: string;
  apiKey?: string;
  projectId?: string;
  widgetId?: string;
  onModelChange: (modelId: string) => void;
  isDraft?: boolean;
}

export const ConversationWindow: React.FC<ChatWindowProps> = ({
  threadId,
  threadTitle,
  apiKey,
  projectId,
  widgetId,
  onModelChange,
  isDraft = false,
}) => {
  // Get all state from context
  const {
    messageHierarchies,
    setIsChatProcessing,
    refreshSpans,
    isLoadingSpans,
    currentInput,
    setCurrentInput,
    typing,
    setTyping,
    error,
    setError,
    traceId,
    setTraceId,
    appendUsage,
    flattenSpans,
    clearAll,
    selectedModel,
    selectedModelInfo,
    setSelectedProviderForConfig,
    selectedProviderForConfig,
    configDialogOpen,
    setConfigDialogOpen,
    providerListDialogOpen,
    setProviderListDialogOpen,
    isSelectedProviderConfigured,
    handleWarningClick,
    modelConfig,
    setModelConfig,
  } = ChatWindowConsumer();

  const { app_mode } = CurrentAppConsumer();
  useEffect(() => {
    clearAll();
    if (threadId && !isDraft) {
      refreshSpans();
    }
  }, [threadId, isDraft, refreshSpans]);

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
    apiKey,
    projectId,
    modelName: selectedModel,
    widgetId,
    threadId,
    threadTitle,
    setCurrentInput,
    setTyping,
    setError,
    setTraceId,
    appendUsage,
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
      toolsUsage?: Map<string, McpServerConfig>;
      othersParams?: Record<string, any>;
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
    emitter.on('vllora_chatTerminate', handleTerminate);
    return () => {
      emitter.off('vllora_chatTerminate', handleTerminate);
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
    emitter.on('vllora_chatWindow', handlerChatWindowEvent);
    return () => {
      emitter.off('vllora_chatWindow', handlerChatWindowEvent);
    }
  }, [threadId, widgetId]);

  useEffect(() => {
    const handleClearChat = (input: { threadId?: string; widgetId?: string }) => {
      if (
        input.threadId === threadId ||
        (input.widgetId && input.widgetId === widgetId)
      ) {
        terminateChat();
      }
    };
    emitter.on('vllora_clearChat', handleClearChat);
    return () => {
      emitter.off('vllora_clearChat', handleClearChat);
    };
  }, [terminateChat, threadId, widgetId]);

  useEffect(() => {
    const handleScrollToBottom = (input: {
      threadId?: string;
      widgetId?: string;
    }) => {
      if (
        messageHierarchies &&
        messageHierarchies.length > 0 &&
        ((input.threadId === threadId && input.threadId) ||
          (input.widgetId && input.widgetId === widgetId))
      ) {
        scrollToBottom();
      }
    };
    emitter.on('vllora_chat_scrollToBottom', handleScrollToBottom);
    return () => {
      emitter.off('vllora_chat_scrollToBottom', handleScrollToBottom);
    };
  }, [messageHierarchies, threadId, scrollToBottom, widgetId]);


  const handleExternalSubmit = useCallback(({
    inputText,
    files,
    searchToolEnabled,
    otherTools,
    threadTitle,
    toolsUsage,
  }: {
    inputText: string;
    files: any[];
    searchToolEnabled?: boolean;
    otherTools?: string[];
    threadTitle?: string;
    toolsUsage?: Map<string, McpServerConfig>;
  }) => {
    if (!isSelectedProviderConfigured && app_mode !== 'langdb') {
      if (!selectedModelInfo) return;
      handleWarningClick?.();
      return
    }
    setCurrentInput('');

    // construct initial messages based on last api_invoke span
    const lastApiInvokeSpan = flattenSpans.filter(span => span.operation_name === 'api_invoke').pop();
    let continousMessage: Message[] = []
    if (lastApiInvokeSpan) {
      continousMessage = extractMessageFromApiInvokeSpan(lastApiInvokeSpan);
    }

    // Filter out null/undefined values from modelConfig and merge with other params
    const filteredModelConfig = Object.entries(modelConfig).reduce((acc, [key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);

    onSubmitWrapper({
      inputText,
      files,
      searchToolEnabled,
      otherTools,
      threadId,
      threadTitle,
      initialMessages: continousMessage,
      toolsUsage,
      othersParams: filteredModelConfig,
    });
  }, [onSubmitWrapper, setCurrentInput, threadId, flattenSpans, isSelectedProviderConfigured, modelConfig, app_mode]);


  useEffect(() => {
    emitter.on('vllora_input_chatSubmit', handleExternalSubmit);

    return () => {
      emitter.off('vllora_input_chatSubmit', handleExternalSubmit);
    };
  }, [handleExternalSubmit]);

  // Ensure typing indicator is visible by scrolling to bottom when typing state changes
  useEffect(() => {
    if (typing) {
      setTimeout(() => scrollToBottom(), 100);
    }
  }, [typing, scrollToBottom]);

  return (
    <div className='flex flex-col flex-1 items-center overflow-hidden'>
      {/* Chat Header */}
      <div className="bg-card w-full flex-shrink-0">
        {/* Model Selector - Top row aligned with Project Dropdown */}
        <ConversationHeader
          modelName={selectedModel}
          modelInfo={selectedModelInfo}
          onModelChange={onModelChange}
          onRefresh={refreshSpans}
          isLoading={isLoadingSpans}
          onModelConfigChange={setModelConfig}
          modelConfig={modelConfig}
        />
      </div>


      <div className="flex-1 w-full overflow-x-hidden flex flex-col">
        {/* Chat Conversation */}
        <ChatConversation
          messages={messageHierarchies}
          isLoading={typing}
          messagesEndRef={messagesEndRef as React.RefObject<HTMLDivElement>}
          scrollToBottom={scrollToBottom}
        />

      </div>
      {/* Error Display */}
      {error && (
        <div className="mx-4 mb-2 bg-red-900/20 border border-red-500/30 flex p-3 rounded-lg items-center gap-1 justify-between shadow-md">
          <div className="flex flex-1 items-center gap-2">
            <span className="text-red-400 text-sm break-words">{error}</span>
          </div>
          <button
            onClick={() => setError(undefined)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          </button>
        </div>
      )}

      {/* Chat Input */}
      <div className="flex-shrink-0 w-full">
        <ModalProvider>
          <ChatInput
            onSubmit={(props) => {
              emitter.emit('vllora_input_chatSubmit', props);
              return Promise.resolve();
            }}
            currentInput={currentInput}
            setCurrentInput={setCurrentInput}
            disabled={typing}
            threadTitle={threadTitle}
          />
          <ModalManager />
        </ModalProvider>
      </div>

      {selectedProviderForConfig && (
        <ProviderConfigDialog
          open={configDialogOpen}
          providerName={selectedProviderForConfig}
          onOpenChange={(inputOpen) => {
            setConfigDialogOpen?.(inputOpen);
          }}
          onSaveSuccess={() => {

          }}
        />
      )}

      {/* Multiple Providers List Dialog */}
      <MultiProviderConfigDialog
        open={providerListDialogOpen}
        providers={selectedModelInfo?.endpoints?.filter(ep => !ep.available) || []}
        onOpenChange={(inputOpen) => {
          setProviderListDialogOpen?.(inputOpen);
        }}
        onProviderSelect={(providerName) => {
          setProviderListDialogOpen?.(false);
          setSelectedProviderForConfig?.(providerName);
          setConfigDialogOpen?.(true);
        }}
      />
    </div>
  );
};