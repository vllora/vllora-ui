import { createContext, useContext, ReactNode, useCallback, useState, useEffect } from 'react';
import { useRequest, useLatest } from 'ahooks';
import { toast } from 'sonner';
import { queryMessages } from '@/services/messages-api';
import { listRuns} from '@/services/runs-api';
import { Message } from '@/types/chat';
import { fetchAllSpansByRunId } from '@/utils/traces';
import { RunDTO, Span } from '@/types/common-type';
import { LangDBEventSpan } from './project-events/dto';
import { convertSpanToRunDTO, convertToNormalSpan } from './project-events/util';

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
      onError: (err) => {
        
      },
      onSuccess: (data) => {
        setServerMessages(data);
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
    setRawRuns(prev => {
      let runIndex = prev.findIndex(r => r.run_id === current_runId);
      if(runIndex === -1) {
        return [...prev, convertSpanToRunDTO(span)];
      }
      let newRun = convertSpanToRunDTO(span, prev[runIndex]);
      prev[runIndex] = newRun;
      return [...prev];
    });
    current_runId && setSpanMap(prev => {
      let runMap = prev[current_runId];
      if(runMap) {
        return { ...prev, [current_runId]: [...runMap, span] };
      } else {
        return { ...prev, [current_runId]: [span] };
      }
   });
  }, []);
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

  const addMessage = useCallback((_message: Message) => {
    // TODO: Implement optimistic message adding if needed
  }, []);

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
  const fetchSpansByRunIdCallback = useCallback(
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
        setSpanMap((prev) => ({ ...prev, [runId]: relatedSpans }));
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




  return {
    serverMessages,
    setServerMessages,
    isLoading,
    loadError,
    addMessage,
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
    // Span data
    spanMap,
    fetchSpansByRunId: fetchSpansByRunIdCallback,
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
