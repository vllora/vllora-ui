import { createContext, useContext, ReactNode, useCallback, useState, useMemo } from 'react';
import { useRequest, useLatest } from 'ahooks';
import { toast } from 'sonner';
import { listSpans } from '@/services/spans-api';
import { Span } from '@/types/common-type';
import { LangDBEventSpan } from './project-events/dto';
import { convertSpanToRunDTO, convertToNormalSpan } from './project-events/util';
import { skipThisSpan } from '@/utils/graph-utils';
import { buildSpanHierarchy } from '@/utils/span-hierarchy';
import { buildMessageHierarchyFromSpan, MessageStructure } from '@/utils/message-structure-from-span';
import { useStableMessageHierarchies } from '@/hooks/useStableMessageHierarchies';
import { useRunsPagination } from '@/hooks/useRunsPagination';
import { useSpanDetails } from '@/hooks/useSpanDetails';


export type ChatWindowContextType = ReturnType<typeof useChatWindow>;

const ChatWindowContext = createContext<ChatWindowContextType | undefined>(undefined);

interface ChatWindowProviderProps {
  threadId: string;
  projectId: string;
}

export function useChatWindow({ threadId, projectId }: ChatWindowProviderProps) {
  // Use the runs pagination hook
  const {
    runs: rawRuns,
    setRuns: setRawRuns,
    runsLoading,
    runsError,
    refreshRuns,
    loadMoreRuns,
    hasMoreRuns,
    runsTotal,
    loadingMoreRuns,
  } = useRunsPagination({ projectId, threadId });

  // Use the span details hook
  const {
    spanMap,
    setSpanMap,
    loadingSpansById,
    fetchSpansByRunId,
    selectedRunId,
    setSelectedRunId,
    spansOfSelectedRun,
    selectedSpanId,
    setSelectedSpanId,
    detailSpanId,
    setDetailSpanId,
    detailSpan
  } = useSpanDetails({ projectId });

  const [isChatProcessing, setIsChatProcessing] = useState<boolean>(false);


  // should the the run be expanded
  const [openTraces, setOpenTraces] = useState<{ run_id: string; tab: 'trace' | 'code' }[]>([]);
  // hovered run id (for highlighting related traces when hovering messages)
  const [hoveredRunId, setHoveredRunId] = useState<string | null>(null);

  const threadIdRef = useLatest(threadId);

  // Conversation spans state (for span-based message rendering)
  const [flattenSpans, setFlattenSpans] = useState<Span[]>([]);
  const spanHierarchies: Span[] = useMemo(
    () => buildSpanHierarchy(flattenSpans),
    [flattenSpans]
  );

  const unstableMessageHierarchies: MessageStructure[] = useMemo(
    () => buildMessageHierarchyFromSpan(flattenSpans),
    [flattenSpans]
  );

  // Stabilize messageHierarchies to prevent unnecessary re-renders
  const messageHierarchies = useStableMessageHierarchies(unstableMessageHierarchies);
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
        setFlattenSpans(spans);
      },
    }
  );



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
      setFlattenSpans(prev => {
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
    }
  }, [threadIdRef]);


  // Wrap refreshRuns to also reset UI state
  const handleRefreshRuns = useCallback(() => {
    setSelectedSpanId(null);
    setSelectedRunId(null);
    setOpenTraces([]);
    refreshRuns();
  }, [refreshRuns]);

  // Map API messages to local Message type
  const runs = rawRuns;

  const appendUsage = useCallback((usage: any) => {
    setUsageInfo((prev) => [...prev, usage]);
  }, []);




  const selectedRun = useMemo(() => {
    return selectedRunId ? runs.find(r => r.run_id === selectedRunId) : undefined;
  }, [selectedRunId, runs]);

  const selectedSpan = useMemo(() => {
    return selectedSpanId ? spansOfSelectedRun.find((s: Span) => s.span_id === selectedSpanId) : undefined;
  }, [selectedSpanId, spansOfSelectedRun]);

  // Derive messages from hierarchical spans
  // const displayMessages = useMemo(() => {
  //   if (spanHierarchies.length === 0) {
  //     return [];
  //   }
  //   // Convert hierarchical spans to messages
  //   return convertSpansToMessages(spanHierarchies);
  // }, [spanHierarchies]);


  const clearAll = useCallback(() => {
    setSpanMap({});
    setSelectedRunId(null);
    setSelectedSpanId(null);
    setDetailSpanId(null);
    setFlattenSpans([]);
  }, []);

  // Calculate sum of all message metrics from displayMessages
  const conversationMetrics = useMemo(() => {
    return {
      cost: 0,
      inputTokens: 0,
      outputTokens: 0,
      duration: 0,
      avgTTFT: 0,
    }
    // if (!displayMessages || displayMessages.length === 0) return undefined;

    // let totalDuration = 0;
    // let totalCost = 0;
    // let totalInputTokens = 0;
    // let totalOutputTokens = 0;
    // let totalTTFT = 0;
    // let ttftCount = 0;



    // return {
    //   cost: totalCost > 0 ? totalCost : undefined,
    //   inputTokens: totalInputTokens > 0 ? totalInputTokens : undefined,
    //   outputTokens: totalOutputTokens > 0 ? totalOutputTokens : undefined,
    //   duration: totalDuration > 0 ? totalDuration / 1000 : undefined, // Convert ms to seconds
    //   avgTTFT: ttftCount > 0 ? (totalTTFT / ttftCount) / 1000 : undefined, // Convert ms to seconds and average
    // };
  }, []);

  return {
    spansOfSelectedRun,
    selectedRun,
    selectedSpan,
    conversationMetrics,

    // Span-based messages
    // displayMessages,
    flattenSpans,
    spanHierarchies,
    isLoadingSpans,
    loadSpansError,
    refreshSpans,

    runs,
    runsLoading,
    runsError,
    refreshRuns: handleRefreshRuns,
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
    setFlattenSpans,

    detailSpanId,
    setDetailSpanId,
    messageHierarchies,
    detailSpan
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
