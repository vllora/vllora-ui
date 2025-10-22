import { createContext, useContext, ReactNode, useCallback, useState, useMemo } from 'react';
import { useRequest } from 'ahooks';
import { toast } from 'sonner';
import { listSpans } from '@/services/spans-api';
import { Span } from '@/types/common-type';
import { ProjectEventUnion } from './project-events/dto';
import { buildSpanHierarchy } from '@/utils/span-hierarchy';
import { buildMessageHierarchyFromSpan, MessageStructure } from '@/utils/message-structure-from-span';
import { useStableMessageHierarchies } from '@/hooks/useStableMessageHierarchies';
import { useDebugControl } from '@/hooks/events/useDebugControl';
import { processEventWithRunMap, updatedRunWithSpans } from '@/hooks/events/utilities';
import { useWrapperHook } from '@/hooks/useWrapperHook';

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
    setRuns,
    runsLoading,
    runsError,
    refreshRuns,
    loadMoreRuns,
    hasMoreRuns,
    runsTotal,
    loadingMoreRuns,
    runMap,
    setRunMap,
    loadingSpansById,
    fetchSpansByRunId,
    selectedRunId,
    setSelectedRunId,
    spansOfSelectedRun,
    selectedSpanId,
    setSelectedSpanId,
    detailSpanId,
    setDetailSpanId,
    detailSpan,
    flattenSpans,
    setFlattenSpans,
    openTraces,
    setOpenTraces,
    hoveredRunId,
    setHoveredRunId,
    isLoadingSpans,
    loadSpansError,
    refreshSpans,
    updateBySpansOfARun
  } = useWrapperHook({ projectId, threadId });

 

  const [isChatProcessing, setIsChatProcessing] = useState<boolean>(false);
  const handleEvent = useCallback((event: ProjectEventUnion) => {
    if (event.run_id && event.thread_id === threadId) {
      //console.log('==== event', event)
      let updatedSpanMap = processEventWithRunMap(runMap, event);
      let spansByRunId = updatedSpanMap[event.run_id];
      setRuns(prev => {
        let newRuns = [...prev];
        let runIndex = newRuns.findIndex(run => run.run_id === event.run_id);
        if (runIndex >= 0) {
          let runById = prev[runIndex]!;
          newRuns[runIndex] = updatedRunWithSpans({
            spans: spansByRunId!,
            prevRun: runById,
            run_id: event.run_id!
          });
        } else {
          newRuns = [updatedRunWithSpans({
            spans: spansByRunId!,
            prevRun: undefined,
            run_id: event.run_id!
          }), ...prev];
        }
        return newRuns;
      });
      updateBySpansOfARun(event.run_id, spansByRunId);
      setSelectedRunId(event.run_id);
      setOpenTraces([{ run_id: event.run_id, tab: 'trace' }]);
    }
  }, [runMap, threadId]);
  
  
  useDebugControl({ handleEvent, channel_name: 'debug-thread-trace-timeline-events' });

  // should the the run be expanded
  // hovered run id (for highlighting related traces when hovering messages)
  // Conversation spans state (for span-based message rendering)
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

  console.log('===== messageHierarchies', messageHierarchies)
  // UI state
  const [currentInput, setCurrentInput] = useState<string>('');
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [traceId, setTraceId] = useState<string | undefined>();
  const [usageInfo, setUsageInfo] = useState<any[]>([]);


  


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
    setRunMap({});
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
    runMap,
    fetchSpansByRunId,
    loadingSpansById,
    projectId,
    isChatProcessing,
    setIsChatProcessing,
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
