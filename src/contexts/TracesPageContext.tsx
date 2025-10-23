import { createContext, useContext, ReactNode, useCallback } from "react";
import { useDebugControl } from "@/hooks/events/useDebugControl";
import { ProjectEventUnion } from "./project-events/dto";
import { createNewRun, processEvent, updatedRunWithSpans } from "@/hooks/events/utilities";
import { useWrapperHook } from "@/hooks/useWrapperHook";

export type TracesPageContextType = ReturnType<typeof useTracesPageContext>;

const TracesPageContext = createContext<TracesPageContextType | undefined>(undefined);


export function useTracesPageContext(props: { projectId: string }) {
  const { projectId } = props;

  // Use the runs pagination hook (no threadId filter for traces page)
  const {
    runs,
    runsLoading,
    runsError,
    refreshRuns,
    loadMoreRuns,
    hasMoreRuns,
    runsTotal,
    loadingMoreRuns,
    flattenSpans,
    setFlattenSpans,
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
    openTraces,
    setOpenTraces,
    hoveredRunId,
    setHoveredRunId,
    setRuns,
    runMap
  } = useWrapperHook({ projectId });

  const handleEvent = useCallback((event: ProjectEventUnion) => {
    if (event.run_id) {

      setTimeout(() => {
        setFlattenSpans(prev => {
          let newFlattenSpans = processEvent(prev, event)
          return newFlattenSpans
        });
        event.run_id && setRuns(prevRuns => {
          // check if run_id exists in prev
          let existingRun = prevRuns.find(r => r.run_id === event.run_id)
          if (existingRun) {
            return prevRuns
          }
          if (!event.run_id) return prevRuns;
          let newRun = createNewRun(event.run_id)
          return [newRun, ...prevRuns]
        });

        event.run_id && setSelectedRunId(event.run_id);
        event.run_id && setOpenTraces([{ run_id: event.run_id, tab: 'trace' }]);
      })

    }
  }, [flattenSpans]);
  useDebugControl({ handleEvent, channel_name: 'debug-traces-timeline-events' });
  // Trace expansion state


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
    runMap,
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