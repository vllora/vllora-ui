import { createContext, useContext, ReactNode, useState, useCallback } from "react";
import { useDebugControl } from "@/hooks/events/useDebugControl";
import { ProjectEventUnion } from "./project-events/dto";
import { processEventWithRunMap, updatedRunWithSpans } from "@/hooks/events/utilities";
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
    setRuns,
    runMap,
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
    setRunMap,
    openTraces,
    setOpenTraces,
    hoveredRunId,
    setHoveredRunId,
  } = useWrapperHook({ projectId });

  const handleEvent = useCallback((event: ProjectEventUnion) => {
    if (event.run_id) {
      let updatedSpanMap = processEventWithRunMap(runMap, event);
      let spanByRunId = updatedSpanMap[event.run_id];
      setRuns(prev => {
        let newRuns = [...prev];
        let runIndex = newRuns.findIndex(run => run.run_id === event.run_id);
        if (runIndex >= 0) {
          let runById = prev[runIndex]!;
          newRuns[runIndex] = updatedRunWithSpans({
            spans: spanByRunId!,
            prevRun: runById,
            run_id: event.run_id!
          });
        } else {
          newRuns = [updatedRunWithSpans({
            spans: spanByRunId!,
            prevRun: undefined,
            run_id: event.run_id!
          }), ...prev];
        }
        return newRuns;
      });
      setRunMap(updatedSpanMap);
      setSelectedRunId(event.run_id);
      setOpenTraces([{ run_id: event.run_id, tab: 'trace' }]);
    }
  }, [runMap]);
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