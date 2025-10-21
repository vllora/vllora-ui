import { createContext, useContext, ReactNode, useState, useMemo, useCallback } from "react";
import { useRunsPagination } from '@/hooks/useRunsPagination';
import { useSpanDetails } from '@/hooks/useSpanDetails';
import { useDebugControl } from "@/hooks/events/useDebugControl";
import { ProjectEventUnion } from "./project-events/dto";
import { RunDTO } from "@/types/common-type";
import { processEvent } from "@/hooks/events/utilities";

export type TracesPageContextType = ReturnType<typeof useTracesPageContext>;

const TracesPageContext = createContext<TracesPageContextType | undefined>(undefined);


export function useTracesPageContext(props: { projectId: string }) {
  const { projectId } = props;

  // Use the runs pagination hook (no threadId filter for traces page)
  const {
    runs,
    setRuns,
    runsLoading,
    runsError,
    refreshRuns,
    loadMoreRuns,
    hasMoreRuns,
    runsTotal,
    loadingMoreRuns,
  } = useRunsPagination({ projectId });

  // Use the span details hook
  const {
    spanMap,
    loadingSpansById,
    fetchSpansByRunId,
    selectedRunId,
    setSelectedRunId,
    selectedSpanId,
    setSelectedSpanId,
    detailSpanId,
    setDetailSpanId,
    detailSpan,
    spansOfSelectedRun,
    setSpanMap
  } = useSpanDetails({ projectId });

  const handleEvent = useCallback((event: ProjectEventUnion) => {
    if(event.run_id) {
      //processEvent(spanMap, event);
      // setRuns(prev => {
      //   const indexOfExistingRun = prev.findIndex(run => run.run_id === event.run_id);
      //   if(indexOfExistingRun != -1) {
      //     let existingRun = prev[indexOfExistingRun]
      //     prev[indexOfExistingRun] = {
      //       ...existingRun,
      //     }
      //     return [...prev];
      //   }
      //   return [...prev, { run_id: event.run_id, thread_ids: [], trace_ids: [], start_time_us: Date.now(), finish_time_us: Date.now(), used_models: [], request_models: [], used_tools: [], mcp_template_definition_ids: [], cost: 0, input_tokens: 0, output_tokens: 0, errors: [] }];
      // });
      // setSelectedRunId(event.run_id);
      // setOpenTraces( [{ run_id: event.run_id, tab: 'trace' }]);
    }
  }, []);

  useDebugControl({ handleEvent, channel_name: 'debug-traces-timeline-events' });

  

  // Trace expansion state
  const [openTraces, setOpenTraces] = useState<{ run_id: string; tab: 'trace' | 'code' }[]>([]);
  const [hoveredRunId, setHoveredRunId] = useState<string | null>(null);

  return {
    projectId,
    runs,
    runsLoading,
    runsError,
    refreshRuns,
    loadMoreRuns,
    hasMoreRuns,
    runsTotal,
    loadingMoreRuns,
    // Trace expansion state
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
    detailSpanId,
    setDetailSpanId,
    detailSpan,
    spansOfSelectedRun
  }
}


export function TracesPageProvider({ children, projectId }: { children: ReactNode; projectId: string }) {
  const value = useTracesPageContext({ projectId });
  return <TracesPageContext.Provider value={value}>{children}</TracesPageContext.Provider>;
}

export function TracesPageConsumer() {
  const context = useContext(TracesPageContext);
  if (context === undefined) {
    throw new Error('TracesPageConsumer must be used within a TracesPageProvider');
  }
  return context;
}