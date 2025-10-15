import { createContext, useContext, ReactNode, useCallback, useState, useMemo } from 'react';
import { useRequest, useLatest } from 'ahooks';
import { toast } from 'sonner';
import { listRuns } from '@/services/runs-api';
import { listSpans } from '@/services/spans-api';
import { fetchAllSpansByRunId } from '@/utils/traces';
import { RunDTO, Span } from '@/types/common-type';
import { LangDBEventSpan } from './project-events/dto';
import { convertSpanToRunDTO, convertToNormalSpan } from './project-events/util';
import { skipThisSpan } from '@/utils/graph-utils';
import { buildSpanHierarchy } from '@/utils/span-hierarchy';
import { convertSpansToMessages } from '@/utils/span-to-message';

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

  // Selection state - split into separate values
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  // should the the run be expanded
  const [openTraces, setOpenTraces] = useState<{ run_id: string; tab: 'trace' | 'code' }[]>([]);
  // hovered run id (for highlighting related traces when hovering messages)
  const [hoveredRunId, setHoveredRunId] = useState<string | null>(null);

  // Span data state
  const [spanMap, setSpanMap] = useState<SpanMap>({});
  const [loadingSpansById, setLoadingSpansById] = useState<Set<string>>(new Set());

  const threadIdRef = useLatest(threadId);
  const projectIdRef = useLatest(projectId);

  // Conversation spans state (for span-based message rendering)
  const [conversationSpans, setConversationSpans] = useState<Span[]>([]);
  const [hierarchicalSpans, setHierarchicalSpans] = useState<Span[]>([]);

  // UI state
  const [currentInput, setCurrentInput] = useState<string>('');
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [traceId, setTraceId] = useState<string | undefined>();
  const [usageInfo, setUsageInfo] = useState<any[]>([]);


  // Use ahooks useRequest for fetching conversation spans
  const { loading: isLoadingSpans, error: loadSpansError, run: refreshSpans } = useRequest(
    async () => {
      if (!threadId || !projectId) {
        return [];
      }
      const response = await listSpans({
        projectId,
        params: {
          threadIds: threadId,
          limit: 1000, // Fetch all spans for this thread
          offset: 0,
        },
      });
      return response.data;
    },
    {
      manual: true,
      onError: (err: any) => {
        toast.error('Failed to load conversation spans', {
          description: err.message || 'An error occurred while loading conversation spans',
        });
      },
      onSuccess: (spans) => {
        setConversationSpans(spans);
        // Build hierarchy from flat span list
        const hierarchy = buildSpanHierarchy(spans);
        setHierarchicalSpans(hierarchy);
      },
    }
  );

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
      setSelectedSpanId(null);
      setSelectedRunId(null);
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
    let currentRunId = span.run_id;

    let ignoreThisSpan = skipThisSpan(span);

    if (!ignoreThisSpan) {
      setRawRuns(prev => {
        let runIndex = prev.findIndex(r => r.run_id === currentRunId);
        if (runIndex === -1) {
          return [...prev, convertSpanToRunDTO(span)];
        }
        let newRun = convertSpanToRunDTO(span, prev[runIndex]);
        // Create a new array instead of mutating prev
        const updated = [...prev];
        updated[runIndex] = newRun;
        return updated;
      });
    }

    currentRunId && setSpanMap(prev => {
      let runMap = prev[currentRunId];
      if (runMap) {
        return { ...prev, [currentRunId]: [...runMap, span] };
      } else {
        return { ...prev, [currentRunId]: [span] };
      }
    });

    // NEW: Update conversation spans if this span belongs to current thread
    if (span.thread_id === threadIdRef.current) {
      setConversationSpans(prev => {
        // Check if span already exists
        const existingIndex = prev.findIndex(s => s.span_id === span.span_id);
        if (existingIndex !== -1) {
          // Update existing span
          const updated = [...prev];
          updated[existingIndex] = span;
          return updated;
        } else {
          // Add new span
          return [...prev, span];
        }
      });

      // Rebuild hierarchy when conversation spans change
      setConversationSpans(currentSpans => {
        const hierarchy = buildSpanHierarchy(currentSpans);
        setHierarchicalSpans(hierarchy);
        return currentSpans;
      });
    }
  }, [threadIdRef]);


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
          setSelectedRunId(runId);
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
    return selectedRunId ? spanMap[selectedRunId] : [];
  }, [selectedRunId, spanMap]);

  const selectedRun = useMemo(() => {
    return selectedRunId ? runs.find(r => r.run_id === selectedRunId) : undefined;
  }, [selectedRunId, runs]);

  const selectedSpan = useMemo(() => {
    return selectedSpanId ? spansOfSelectedRun.find(s => s.span_id === selectedSpanId) : undefined;
  }, [selectedSpanId, spansOfSelectedRun]);

  // Derive messages from hierarchical spans
  const displayMessages = useMemo(() => {
    if (hierarchicalSpans.length === 0) {
      return [];
    }
    // Convert hierarchical spans to messages
    return convertSpansToMessages(hierarchicalSpans);
  }, [hierarchicalSpans]);


  const clearAll = useCallback(() => {
    setSpanMap({});
    setSelectedRunId(null);
    setSelectedSpanId(null);
    setHierarchicalSpans([]);
    setConversationSpans([]);
  }, []);

  // Calculate sum of all message metrics from displayMessages
  const conversationMetrics = useMemo(() => {
    if (!displayMessages || displayMessages.length === 0) return undefined;

    let totalDuration = 0;
    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTTFT = 0;
    let ttftCount = 0;



    return {
      cost: totalCost > 0 ? totalCost : undefined,
      inputTokens: totalInputTokens > 0 ? totalInputTokens : undefined,
      outputTokens: totalOutputTokens > 0 ? totalOutputTokens : undefined,
      duration: totalDuration > 0 ? totalDuration / 1000 : undefined, // Convert ms to seconds
      avgTTFT: ttftCount > 0 ? (totalTTFT / ttftCount) / 1000 : undefined, // Convert ms to seconds and average
    };
  }, [displayMessages]);

  return {
    spansOfSelectedRun,
    selectedRun,
    selectedSpan,
    conversationMetrics,

    // Span-based messages
    displayMessages,
    conversationSpans,
    hierarchicalSpans,
    isLoadingSpans,
    loadSpansError,
    refreshSpans,

    runs,
    runsLoading,
    runsError,
    refreshRuns,
    loadMoreRuns,
    hasMoreRuns,
    runsTotal,
    loadingMoreRuns,
    // Selection state
    selectedSpanId,
    setSelectedSpanId,
    selectedRunId,
    setSelectedRunId,
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
    traceId,
    setTraceId,
    usageInfo,
    appendUsage,
    clearAll,
    upsertRun,
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
