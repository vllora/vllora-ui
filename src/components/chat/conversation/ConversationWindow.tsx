import React, { useCallback, useEffect, useRef } from 'react';
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
import { extractMessagesFromSpanById } from '@/utils/span-to-message';
import { McpServerConfig } from '@/services/mcp-api';
import { ProviderConfigDialog } from '../traces/model-selector/ProviderConfigDialog';
import { MultiProviderConfigDialog } from '../traces/model-selector/MultiProviderConfigDialog';
import { CurrentAppConsumer } from '@/contexts/CurrentAppContext';
import { ModelInfo } from '@/lib';
import { BreakpointsConsumer } from '@/contexts/breakpoints';
import { Breakpoint } from '@/contexts/breakpoints/dto';
import { ThreadsConsumer } from '@/contexts/ThreadsContext';
import { Span } from '@/types/common-type';
import { processEvent, updatedRunWithSpans } from '@/hooks/events/utilities';

/**
 * Convert a Breakpoint to a paused Span for display
 * Manual creation allows batching all span updates into a single state change
 */
const createSpansFromBreakpoint = (breakpoint: Breakpoint): Span[] => {
  let initialSpans: Span[] = []
  let breakpoin_events = breakpoint.events;
  let result = initialSpans;
  breakpoin_events.forEach(e => {
    result = processEvent(result, e)
  })
  return result;
};

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
    isChatProcessing,
    clearSelectPrevThread,
    setFlattenSpans,
    setRuns,
    setOpenTraces
  } = ChatWindowConsumer();
  const { app_mode } = CurrentAppConsumer();
  const { breakpoints, isDebugActive, refresh: refreshBreakpoints } = BreakpointsConsumer();
  const { setThreads, loading: isLoadingThreads } = ThreadsConsumer();

  // Track previous loading states to detect when refresh completes
  const prevSpansLoadingRef = useRef(isLoadingSpans);
  const prevThreadsLoadingRef = useRef(isLoadingThreads);

  // Wrapper for model config change that also updates the selected model if config contains a model field
  const handleModelConfigChange = useCallback((newConfig: Record<string, any>) => {
    setModelConfig(newConfig);
    // If config has a model field, also update the selected model
    if (newConfig.model && typeof newConfig.model === 'string') {
      onModelChange(newConfig.model);
    }
  }, [setModelConfig, onModelChange]);

  useEffect(() => {
    if (isChatProcessing || isDraft || !threadId) { return }
    refreshSpans();
    // Also fetch latest breakpoints to ensure paused spans can be reconstructed
    refreshBreakpoints();
  }, [isChatProcessing, isDraft, threadId, refreshBreakpoints]);

  // Merge breakpoint spans after refresh completes or when breakpoints change
  // Paused spans are not in the database yet, so we need to reconstruct them from breakpoints
  // Manual creation batches all updates into a single state change to avoid UI flickering
  useEffect(() => {
    const wasLoading = prevSpansLoadingRef.current;
    prevSpansLoadingRef.current = isLoadingSpans;

    // Merge when:
    // 1. Loading just completed (was loading, now not loading), OR
    // 2. Breakpoints changed while not loading (handles race condition where breakpoints arrive after spans)
    const shouldMerge = (wasLoading && !isLoadingSpans) || (!isLoadingSpans && !wasLoading);

    if (shouldMerge && isDebugActive && threadId) {
      const breakpointsForThread = breakpoints.filter(b => b.thread_id === threadId);
      if (breakpointsForThread.length > 0) {
        // Track run_ids that need to be updated
        const runIdsToUpdate = new Set<string>();
        let spansFromBreakPoints: Span[] = breakpointsForThread.map(b => createSpansFromBreakpoint(b)).flat().sort((a, b) => a.start_time_us - b.start_time_us)
        spansFromBreakPoints.forEach(s => {
          runIdsToUpdate.add(s.run_id)
        })

        setRuns(prevRuns => {
          let updatedRuns = [...prevRuns];
          for (const runId of runIdsToUpdate) {
            const existingRunIndex = updatedRuns.findIndex(r => r.run_id === runId);
            const updatedRun = updatedRunWithSpans({
              spans: spansFromBreakPoints.filter(s => s.run_id === runId),
              run_id: runId,
              prevRun: existingRunIndex >= 0 ? updatedRuns[existingRunIndex] : undefined
            });
            if (existingRunIndex >= 0) {
              updatedRuns[existingRunIndex] = updatedRun;
            } else {
              updatedRuns = [updatedRun, ...updatedRuns];
            }
          }
          return updatedRuns;
        });

        // Open traces for runs in debug mode
        setOpenTraces(prevOpenTraces => {
          const newOpenTraces = [...prevOpenTraces];
          for (const runId of runIdsToUpdate) {
            if (!newOpenTraces.some(t => t.run_id === runId)) {
              newOpenTraces.push({ run_id: runId, tab: 'trace' });
            }
          }
          return newOpenTraces;
        });
        setFlattenSpans(prevSpans => {
          const newSpans = [...prevSpans];
          let hasChanges = false;

          // Merge precomputed breakpoint spans into existing spans
          for (const breakpointSpan of spansFromBreakPoints) {
            const existIdx = newSpans.findIndex(s => s.span_id === breakpointSpan.span_id);
            if (existIdx >= 0) {
              // Update existing span if not already marked as debug
              if (!newSpans[existIdx].isInDebug) {
                newSpans[existIdx] = breakpointSpan;
                hasChanges = true;
              }
            } else {
              // Add new span
              newSpans.push({ ...breakpointSpan });
              hasChanges = true;
            }
          }

          return hasChanges ? newSpans.sort((a, b) => a.start_time_us - b.start_time_us) : prevSpans;
        });
      }
    }
  }, [isLoadingSpans, isDebugActive, breakpoints, threadId, setFlattenSpans, setRuns, setOpenTraces]);

  // Update thread list to mark threads with active breakpoints as is_debug
  // Also create threads that don't exist yet (when initial span is paused and not committed to DB)
  // Must wait for threads to finish loading to avoid race condition where API response overwrites our changes
  useEffect(() => {
    const wasLoadingThreads = prevThreadsLoadingRef.current;
    prevThreadsLoadingRef.current = isLoadingThreads;

    // Merge when:
    // 1. Threads loading just completed, OR
    // 2. Breakpoints changed while threads are not loading
    const shouldMergeThreads = (wasLoadingThreads && !isLoadingThreads) || (!isLoadingThreads && !wasLoadingThreads);

    if (shouldMergeThreads && breakpoints.length > 0) {
      // Group breakpoints by thread_id
      const breakpointsByThread = breakpoints.reduce((acc, bp) => {
        if (!acc[bp.thread_id]) {
          acc[bp.thread_id] = [];
        }
        acc[bp.thread_id].push(bp);
        return acc;
      }, {} as Record<string, Breakpoint[]>);

      setThreads(prevThreads => {
        let hasChanges = false;
        const updatedThreads = [...prevThreads];

        // Update existing threads and create missing ones
        for (const [bpThreadId, bps] of Object.entries(breakpointsByThread)) {
          const existingIndex = updatedThreads.findIndex(t => t.thread_id === bpThreadId);

          if (existingIndex === -1) {
            // Thread doesn't exist - create it from breakpoint data
            // Extract model from the first breakpoint's request if available
            const firstBp = bps[0];
            const request = firstBp.request as { model?: string } | undefined;
            const modelName = request?.model;

            updatedThreads.unshift({
              thread_id: bpThreadId,
              is_from_local: false,
              is_debug: true,
              start_time_us: Date.now() * 1000,
              finish_time_us: Date.now() * 1000,
              run_ids: [],
              input_models: modelName ? [modelName] : [],
              cost: 0,
            });
            hasChanges = true;
          } else if (!updatedThreads[existingIndex].is_debug) {
            // Thread exists but not marked as debug
            updatedThreads[existingIndex] = {
              ...updatedThreads[existingIndex],
              is_debug: true,
            };
            hasChanges = true;
          }
        }

        return hasChanges ? updatedThreads : prevThreads;
      });
    }
  }, [breakpoints, setThreads, isLoadingThreads]);

  useEffect(() => {
    clearSelectPrevThread()
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

    const listModelCallSpan = flattenSpans.filter(span => span.operation_name === 'model_call').sort((a, b) => a.start_time_us - b.start_time_us)
    let lastModelCallSpan = listModelCallSpan.length > 0 ? listModelCallSpan[listModelCallSpan.length - 1] : undefined
    let actuallModelCallSpan = lastModelCallSpan ? flattenSpans.find(s => s.parent_span_id === lastModelCallSpan?.span_id) : undefined

    let continousMessage: Message[] = []
    if (actuallModelCallSpan) {
      continousMessage = extractMessagesFromSpanById(flattenSpans, actuallModelCallSpan.span_id, {
        excludeToolInvokeMessage: false,
      });
    }

    // Filter out null/undefined values and internal metadata fields from modelConfig
    const filteredModelConfig = Object.entries(modelConfig).reduce((acc, [key, value]) => {
      // Skip internal metadata fields that start with underscore
      if (key.startsWith('_')) {
        return acc;
      }
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
          onRefresh={refreshSpans}
          isLoading={isLoadingSpans}
          onModelConfigChange={handleModelConfigChange}
          modelConfig={modelConfig}
          projectId={projectId}
          app_mode={app_mode}
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
        providers={(selectedModelInfo as ModelInfo)?.endpoints?.filter(ep => !ep.available) || []}
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