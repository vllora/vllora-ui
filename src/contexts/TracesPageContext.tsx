import { createContext, useContext, ReactNode, useCallback } from "react";
import { useDebugControl } from "@/hooks/events/useDebugControl";
import { ProjectEventUnion } from "./project-events/dto";
import { processEvent, updatedRunWithSpans } from "@/hooks/events/utilities";
import { useWrapperHook } from "@/hooks/useWrapperHook";
import { Span } from "@/types/common-type";

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
    runMap,
    collapsedSpans,
    setCollapsedSpans,
  } = useWrapperHook({ projectId, onRunsLoaded: (runs) => {
       if(runs && runs.length > 0 && runs[0].run_id){
         fetchSpansByRunId(runs[0].run_id)
       }
  } });

  const updateRunMetrics = useCallback((run_id: string, updatedSpans: Span[]) => {
      setRuns(prevRuns => {
        let runById = prevRuns.find(r => r.run_id === run_id)
        if(!runById) {
          let newRun = updatedRunWithSpans({
            spans: updatedSpans.filter(s => s.run_id === run_id),
            run_id
          })
          return [newRun, ...prevRuns];
        };
        let updatedRun = updatedRunWithSpans({
          spans: updatedSpans.filter(s => s.run_id === run_id),
          run_id,
          prevRun: runById
        })
        return prevRuns.map(r => r.run_id === run_id ? updatedRun : r)
      })
    }, []);
  const handleEvent = useCallback((event: ProjectEventUnion) => {
    if (event.run_id) {
      setTimeout(() => {
        setFlattenSpans(prevSpans => {
          let newFlattenSpans = processEvent(prevSpans, event)

          // Update run metrics with the new spans
          event.run_id && updateRunMetrics(event.run_id, newFlattenSpans);

          return newFlattenSpans
        });

        event.run_id && setSelectedRunId(event.run_id);
        event.run_id && setOpenTraces([{ run_id: event.run_id, tab: 'trace' }]);
      }, 0)

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
    spansOfSelectedRun,
    collapsedSpans,
    setCollapsedSpans,
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