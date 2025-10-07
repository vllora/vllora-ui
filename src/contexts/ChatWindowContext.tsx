import { createContext, useContext, ReactNode, useCallback, useState, useMemo } from 'react';
import { useRequest, useLatest } from 'ahooks';
import { toast } from 'sonner';
import { getMessageById, queryMessages } from '@/services/messages-api';
import { listRuns } from '@/services/runs-api';
import { Message, MessageMetrics } from '@/types/chat';
import { fetchAllSpansByRunId } from '@/utils/traces';
import { RunDTO, Span } from '@/types/common-type';
import { LangDBEventSpan } from './project-events/dto';
import { convertSpanToRunDTO, convertToNormalSpan } from './project-events/util';
import { skipThisSpan } from '@/utils/graph-utils';

export interface SelectedSpanInfo {
  spanId: string;
  runId: string;
}

export interface SpanMap {
  [key: string]: Span[];
}


export type ChatWindowContextType = ReturnType<typeof useChatWindow>;

const ChatWindowContext = createContext<ChatWindowContextType | undefined>(undefined);

interface ChatWindowProviderProps {
  threadId: string;
  projectId: string;
}

const LIMIT_LOADING_RUNS = 20;

export function useChatWindow({ threadId, projectId }: ChatWindowProviderProps) {
  // Pagination state for runs
  const [runsOffset, setRunsOffset] = useState<number>(0);
  const [runsTotal, setRunsTotal] = useState<number>(0);
  const [hasMoreRuns, setHasMoreRuns] = useState<boolean>(false);
  const [loadingMoreRuns, setLoadingMoreRuns] = useState<boolean>(false);
  const [rawRuns, setRawRuns] = useState<RunDTO[]>([]);


  const [isChatProcessing, setIsChatProcessing] = useState<boolean>(false);

  // Selection state
  const [selectedSpanInfo, setSelectedSpanInfo] = useState<SelectedSpanInfo | null>(null);
  // should the the run be expanded
  const [openTraces, setOpenTraces] = useState<string[]>([]);
  // hovered run id (for highlighting related traces when hovering messages)
  const [hoveredRunId, setHoveredRunId] = useState<string | null>(null);

  // Span data state
  const [spanMap, setSpanMap] = useState<SpanMap>({});
  const [loadingSpansById, setLoadingSpansById] = useState<Set<string>>(new Set());

  const threadIdRef = useLatest(threadId);
  const projectIdRef = useLatest(projectId);


  const [serverMessages, setServerMessages] = useState<Message[]>([]);

  // UI state
  const [currentInput, setCurrentInput] = useState<string>('');
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [messageId, setMessageId] = useState<string | undefined>();
  const [traceId, setTraceId] = useState<string | undefined>();
  const [usageInfo, setUsageInfo] = useState<any[]>([]);


  // Use ahooks useRequest for fetching messages
  const { loading: isLoading, error: loadError, run: refreshMessages } = useRequest(
    async () => {
      if (!threadId || !projectId) {
        return [];
      }
      const response = await queryMessages(projectId, threadId, {
        order_by: [['created_at', 'asc']],
        limit: 100,
        offset: 0,
      });
      return response;
    },
    {
      manual: true,
      onError: (err: any) => {
        toast.error('Failed to load messages', {
          description: err.message || 'An error occurred while loading messages',
        });
      },
      onSuccess: (data) => {
        setServerMessages(data);
      },

    }
  );


  const refreshMessageById = useCallback(async (input: {
    messageId: string;
    threadId: string;
    projectId: string;
  }) => {
    try {
      if (input.threadId !== threadIdRef.current || input.projectId !== projectIdRef.current) {
        return;
      }
      const message: Message = await getMessageById({
        messageId: input.messageId,
        projectId: input.projectId,
        threadId: input.threadId
      });

      setServerMessages(prev => {
        let newMessages = [...prev];
        let index = newMessages.findIndex(m => m.id === input.messageId);
        if (index === -1) {
          //newMessages.push(message);
        } else {
          let prevMessage = newMessages[index];

          // NOTE: work around for metrics not being returned in the message since message is commited but not the metrics
          if (message.metrics && message.metrics.length > 0) {
            newMessages[index] = message;
          } else {
            newMessages[index] = {
              ...message,
              metrics: prevMessage.metrics
            }

          }
        }
        return newMessages;
      });

    } catch (err) {
      toast.error('Failed to load message', {
        description: (err as Error).message || 'An error occurred while loading message',
      });
    }
  }, []);

  // Use ahooks useRequest for fetching runs of this thread (initial load)
  const {
    loading: runsLoading,
    error: runsError,
    run: triggerRefreshRuns,
  } = useRequest(
    async () => {
      if (!threadId || !projectId) {
        return { data: [], pagination: { offset: 0, limit: 0, total: 0 } };
      }
      const response = await listRuns({
        projectId,
        params: {
          threadIds: threadId, // Comma-separated string
          limit: LIMIT_LOADING_RUNS,
          offset: 0,
        },
      });
      // Update pagination state
      const runs = response?.data || [];
      const pagination = response?.pagination || { offset: 0, limit: 0, total: 0 };

      const newOffset = runs.length;
      const newHasMore = pagination.total > runs.length;

      setRunsTotal(pagination.total);
      setRunsOffset(newOffset);
      setHasMoreRuns(newHasMore);
      setRawRuns(runs);
      setSelectedSpanInfo(null);
      setOpenTraces([]);

      return response;
    },
    {
      refreshDeps: [threadId, projectId],
      onError: (err) => {
        toast.error('Failed to load runs', {
          description: err.message || 'An error occurred while loading runs',
        });
      }
    }
  );

  // Load more runs function
  const loadMoreRuns = useCallback(async () => {
    if (runsLoading || loadingMoreRuns || !hasMoreRuns || runsOffset === 0) return;

    setLoadingMoreRuns(true);
    try {
      const response = await listRuns({
        projectId: projectIdRef.current,
        params: {
          threadIds: threadIdRef.current,
          limit: LIMIT_LOADING_RUNS,
          offset: runsOffset,
        },
      });

      const runs = response?.data || [];
      const pagination = response?.pagination || { offset: 0, limit: 0, total: 0 };

      // Update pagination state
      const newOffset = runsOffset + runs.length;
      const newHasMore = pagination.total > newOffset;

      setRunsTotal(pagination.total);
      setRunsOffset(newOffset);
      setHasMoreRuns(newHasMore);
      setRawRuns((prev) => [...prev, ...runs]);
    } catch (err: any) {
      toast.error('Failed to load more runs', {
        description: err.message || 'An error occurred while loading more runs',
      });
    } finally {
      setLoadingMoreRuns(false);
    }
  }, [runsLoading, loadingMoreRuns, hasMoreRuns, runsOffset, threadIdRef, projectIdRef]);


  const addEventSpans = useCallback((eventSpans: LangDBEventSpan[]) => {
    eventSpans.sort((a, b) => a.start_time_unix_nano - b.start_time_unix_nano).forEach(span => {
      addEventSpan(span as LangDBEventSpan);
    });
  }, []);

  const addEventSpan = useCallback((eventSpan: LangDBEventSpan) => {
    const span = convertToNormalSpan(eventSpan);
    let current_runId = span.run_id;

    let ignoreThisSpan = skipThisSpan(span);

    !ignoreThisSpan && setRawRuns(prev => {
      let runIndex = prev.findIndex(r => r.run_id === current_runId);
      if (runIndex === -1) {
        return [...prev, convertSpanToRunDTO(span)];
      }
      let newRun = convertSpanToRunDTO(span, prev[runIndex]);
      prev[runIndex] = newRun;
      return [...prev];
    });
    current_runId && setSpanMap(prev => {
      let runMap = prev[current_runId];
      if (runMap) {
        return { ...prev, [current_runId]: [...runMap, span] };
      } else {
        return { ...prev, [current_runId]: [span] };
      }
    });
  }, []);


  const upsertRun = useCallback((input: {
    runId: string;
    timestamp: number;
    threadId: string;
    request_models?: string[];
    used_models?: string[];
    used_tools?: string[];
    mcp_template_definition_ids?: string[];
    cost?: number;
    input_tokens?: number;
    output_tokens?: number;
    errors?: string[];
  }) => {
    if (input.threadId !== threadId) return;
    setRawRuns(prev => {
      const runIndex = prev.findIndex(r => r.run_id === input.runId && r.thread_ids.includes(input.threadId));
      // Create new run
      if (runIndex === -1) {
        const startTime_micro = input.timestamp * 1000;
        const newRunDTO: RunDTO = {
          run_id: input.runId,
          thread_ids: [input.threadId],
          trace_ids: [],
          used_models: input.used_models || [],
          request_models: input.request_models || [],
          used_tools: input.used_tools || [],
          mcp_template_definition_ids: input.mcp_template_definition_ids || [],
          cost: input.cost || 0,
          input_tokens: input.input_tokens || 0,
          output_tokens: input.output_tokens || 0,
          start_time_us: startTime_micro,
          finish_time_us: startTime_micro,
          errors: input.errors || [],
        };
        return [newRunDTO, ...prev];
      }

      // Update existing run
      const existingRun = prev[runIndex];
      const newRun: RunDTO = {
        ...existingRun,
        used_models: input.used_models?.length
          ? [...new Set([...existingRun.used_models, ...input.used_models])]
          : existingRun.used_models,
        request_models: input.request_models?.length
          ? [...new Set([...existingRun.request_models, ...input.request_models])]
          : existingRun.request_models,
        used_tools: input.used_tools?.length
          ? [...new Set([...existingRun.used_tools, ...input.used_tools])]
          : existingRun.used_tools,
        mcp_template_definition_ids: input.mcp_template_definition_ids?.length
          ? [...new Set([...existingRun.mcp_template_definition_ids, ...input.mcp_template_definition_ids])]
          : existingRun.mcp_template_definition_ids,
        cost: input.cost ?? existingRun.cost,
        input_tokens: input.input_tokens ?? existingRun.input_tokens,
        output_tokens: input.output_tokens ?? existingRun.output_tokens,
        errors: input.errors?.length ? input.errors : existingRun.errors,
      };

      const updated = [...prev];
      updated[runIndex] = newRun;
      return updated;
    });
  }, [threadId])


  // Refresh runs function (reset and reload from beginning)
  const refreshRuns = useCallback(() => {
    setRunsOffset(0);
    setRunsTotal(0);
    setHasMoreRuns(false);
    setRawRuns([]);
    triggerRefreshRuns();
  }, [triggerRefreshRuns]);

  // Map API messages to local Message type
  const runs = rawRuns;



  const updateMessageMetrics: (input: {
    message_id: string;
    thread_id: string;
    run_id?: string;
    metrics: MessageMetrics;
  }) => void = useCallback((input) => {
    setServerMessages((prev) => {
      const messageIndex = prev.findIndex(
        (msg) =>
          msg.id === input.message_id && msg.thread_id === input.thread_id
      );
      if (messageIndex === -1) return prev;

      const existingMessage = prev[messageIndex];
      const existingMetrics = existingMessage.metrics || [];

      // Find if there's already a metric entry for this run_id
      const sameRunIndex = existingMetrics.findIndex(
        (metric) => metric.run_id === input.run_id
      );
      let updatedMetrics: MessageMetrics[];

      if (sameRunIndex !== -1) {
        // Same run exists - merge the metrics, preferring non-undefined values from input
        const existingMetric = existingMetrics[sameRunIndex];
        const mergedMetric: MessageMetrics = {
          run_id: input.metrics.run_id ?? existingMetric.run_id,
          trace_id: input.metrics.trace_id ?? existingMetric.trace_id,
          cost: (input.metrics.cost && input.metrics.cost > 0) ? input.metrics.cost : existingMetric.cost,
          ttft: (input.metrics.ttft && input.metrics.ttft > 0) ? input.metrics.ttft : existingMetric.ttft,
          duration: (input.metrics.duration && input.metrics.duration > 0) ? input.metrics.duration : existingMetric.duration,
          start_time_us: (input.metrics?.start_time_us && input.metrics?.start_time_us > 0) ? input.metrics?.start_time_us : existingMetric.start_time_us,
          usage: input.metrics.usage
            ? {
              input_tokens: (input.metrics.usage?.input_tokens && input.metrics.usage?.input_tokens > 0) ? input.metrics.usage?.input_tokens : existingMetric.usage?.input_tokens,
              output_tokens: (input.metrics.usage?.output_tokens && input.metrics.usage?.output_tokens > 0) ? input.metrics.usage?.output_tokens : existingMetric.usage?.output_tokens,
              prompt_tokens: (input.metrics.usage?.prompt_tokens && input.metrics.usage?.prompt_tokens > 0) ? input.metrics.usage?.prompt_tokens : existingMetric.usage?.prompt_tokens,
              completion_tokens: input.metrics.usage?.completion_tokens ?? existingMetric.usage?.completion_tokens,
              cost: input.metrics.usage?.cost ?? existingMetric.usage?.cost,
            }
            : existingMetric.usage,
        };

        updatedMetrics = existingMetrics.map((metric, idx) =>
          idx === sameRunIndex ? mergedMetric : metric
        );
      } else {
        // Different run - append new metrics
        updatedMetrics = [...existingMetrics, input.metrics];
      }

      // Return new array with updated message
      return prev.map((msg, idx) =>
        idx === messageIndex
          ? { ...msg, metrics: updatedMetrics }
          : msg
      );
    });
  }, []);

  const upsertMessage = useCallback(
    (input: {
      message_id: string;
      thread_id: string;
      run_id?: string;
      message_type: string;
      trace_id?: string;
      delta?: string;
      is_loading?: boolean;
      metrics?: MessageMetrics[];
      timestamp: number;
    }) => {
      setServerMessages((prev) => {
        const messageIndex = prev.findIndex(
          (msg) =>
            msg.id === input.message_id && msg.thread_id === input.thread_id
        );
        if (messageIndex === -1) {
          let newMsg: Message = {
            id: input.message_id,
            type: input.message_type,
            thread_id: input.thread_id,
            content_type: "Text",
            content: input.delta || "",
            timestamp: input.timestamp,
            trace_id: input.trace_id,
            metrics: input.metrics || [
              {
                run_id: input.run_id,
              },
            ],
          };
          return [...prev, newMsg];
        } else {
          const prevMsg = prev[messageIndex];
          let newMetrics = prevMsg.metrics || [];

          if (
            newMetrics.length > 0 &&
            input.metrics &&
            input.metrics.length > 0
          ) {
            let firstPrevMetric = newMetrics[0];
            let firstInputMetric = input.metrics[0];
            firstPrevMetric = {
              ...firstPrevMetric,
              ...firstInputMetric,
            };
            newMetrics = [firstPrevMetric];
          } else {
            newMetrics = input.metrics || [
              {
                run_id: input.run_id,
              },
            ];
          }

          // Immutably update the message - avoid mutation
          const updatedMessage: Message = {
            ...prevMsg,
            content: prevMsg.content + (input.delta || ""),
            timestamp: input.timestamp,
            trace_id: input.trace_id || prevMsg.trace_id,
            metrics: newMetrics,
            is_loading: input.is_loading ?? prevMsg.is_loading,
          };

          return prev.map((msg, idx) =>
            idx === messageIndex ? updatedMessage : msg
          );
        }
      });
    },
    []
  );

  const clearMessages = useCallback(() => {
    setServerMessages([]);
  }, []);

  const appendUsage = useCallback((usage: any) => {
    setUsageInfo((prev) => [...prev, usage]);
  }, []);



  /**
   * Fetches detailed span data for a specific run when user expands a row
   * Prevents concurrent duplicate requests but allows re-fetching after collapse/expand
   *
   * @param runId - The run ID to fetch spans for
   */
  const fetchSpansByRunId = useCallback(
    async (runId: string) => {
      // Check if already loading this runId to prevent concurrent duplicate requests
      // We use functional state updates to access the latest loadingSpansById without adding it to deps
      let shouldFetch = true;
      setLoadingSpansById((prev) => {
        if (prev.has(runId)) {
          shouldFetch = false;
          return prev;
        }
        return new Set(prev).add(runId);
      });

      if (!shouldFetch) {
        return;
      }

      try {
        const relatedSpans = await fetchAllSpansByRunId(runId, projectIdRef.current);
        let firstSpan = undefined
        for (let i = 0; i < relatedSpans.length; i++) {
          if (skipThisSpan(relatedSpans[i])) {
            continue;
          }
          firstSpan = relatedSpans[i];
          break;
        }
        setSpanMap((prev) => ({ ...prev, [runId]: relatedSpans }));
        // auto select the first span
        if (firstSpan) {
          setSelectedSpanInfo({
            runId,
            spanId: firstSpan.span_id,
          });
        }
      } catch (e: any) {
        console.error('==== Error fetching spans by run id:', e);
        toast.error('Failed to fetch span details', {
          description: e.message || 'An error occurred while fetching span details',
        });
      } finally {
        // Remove from loading set
        setLoadingSpansById((prev) => {
          const newSet = new Set(prev);
          newSet.delete(runId);
          return newSet;
        });
      }
    },
    [projectIdRef]
  );

  const spansOfSelectedRun = useMemo(() => {
    return selectedSpanInfo?.runId ? spanMap[selectedSpanInfo.runId] : [];
  }, [selectedSpanInfo, spanMap]);
  const selectedRun = useMemo(() => {
    return selectedSpanInfo?.runId ? runs.find(r => r.run_id === selectedSpanInfo.runId) : undefined;
  }, [selectedSpanInfo, runs]);

  const selectedSpan = useMemo(() => {
    return selectedSpanInfo?.spanId ? spansOfSelectedRun.find(s => s.span_id === selectedSpanInfo.spanId) : undefined;
  }, [selectedSpanInfo, spansOfSelectedRun]);

  // Calculate sum of all message metrics
  const conversationMetrics = useMemo(() => {
    if (!serverMessages || serverMessages.length === 0) return undefined;

    let totalDuration = 0;
    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTTFT = 0;
    let ttftCount = 0;

    serverMessages.filter(m => m.type !== 'human').forEach(message => {
      if (message.metrics && Array.isArray(message.metrics)) {
        message.metrics.forEach(metric => {
          if (metric.duration && metric.duration > 0) {
            totalDuration += metric.duration;
          }
          if (metric.cost && metric.cost > 0) {
            totalCost += metric.cost;
          }
          if (metric.usage) {
            totalInputTokens += metric.usage.input_tokens || 0;
            totalOutputTokens += metric.usage.output_tokens || 0;
          }
          if (metric.ttft && metric.ttft > 0) {
            totalTTFT += metric.ttft;
            ttftCount++;
          }
        });
      }
    });

    return {
      cost: totalCost > 0 ? totalCost : undefined,
      inputTokens: totalInputTokens > 0 ? totalInputTokens : undefined,
      outputTokens: totalOutputTokens > 0 ? totalOutputTokens : undefined,
      duration: totalDuration > 0 ? totalDuration / 1000 : undefined, // Convert ms to seconds
      avgTTFT: ttftCount > 0 ? (totalTTFT / ttftCount) / 1000 : undefined, // Convert ms to seconds and average
    };
  }, [serverMessages]);

  return {
    spansOfSelectedRun,
    selectedRun,
    selectedSpan,
    conversationMetrics,



    serverMessages,
    setServerMessages,
    isLoading,
    loadError,
    clearMessages,
    refreshMessages,
    runs,
    runsLoading,
    runsError,
    refreshRuns,
    loadMoreRuns,
    hasMoreRuns,
    runsTotal,
    loadingMoreRuns,
    // Selection state
    selectedSpanInfo,
    setSelectedSpanInfo,
    openTraces,
    setOpenTraces,
    hoveredRunId,
    setHoveredRunId,
    // Span data
    spanMap,
    fetchSpansByRunId,
    loadingSpansById,
    projectId,
    isChatProcessing,
    setIsChatProcessing,
    addEventSpans,
    // UI state
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
    usageInfo,
    appendUsage,


    upsertRun,
    upsertMessage,
    updateMessageMetrics,
    refreshMessageById,
  };
}
export function ChatWindowProvider({ children, threadId, projectId }: { children: ReactNode, threadId: string, projectId: string }) {
  const value = useChatWindow({ threadId, projectId });
  return <ChatWindowContext.Provider value={value}>{children}</ChatWindowContext.Provider>;
}
export function ChatWindowConsumer() {
  const context = useContext(ChatWindowContext);
  if (context === undefined) {
    throw new Error('ChatWindowConsumer must be used within a ChatWindowProvider');
  }
  return context;
}
