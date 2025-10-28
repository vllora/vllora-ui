import { createContext, useContext, ReactNode, useCallback, useState, useRef, useEffect } from "react";
import { useDebugControl } from "@/hooks/events/useDebugControl";
import { ProjectEventUnion } from "./project-events/dto";
import { processEvent, updatedRunWithSpans } from "@/hooks/events/utilities";
import { useWrapperHook } from "@/hooks/useWrapperHook";
import { Span } from "@/types/common-type";
import { useGroupsPagination } from "@/hooks/useGroupsPagination";
import { fetchGroupSpans } from "@/services/groups-api";
import { toast } from "sonner";

export type TracesPageContextType = ReturnType<typeof useTracesPageContext>;

const TracesPageContext = createContext<TracesPageContextType | undefined>(undefined);

export type GroupByMode = 'run' | 'bucket';
export type BucketSize = 300 | 600 | 1200 | 1800 | 3600 | 7200 | 10800 | 21600 | 43200 | 86400; // 5m, 10m, 20m, 30m, 1h, 2h, 3h, 6h, 12h, 24h

export function useTracesPageContext(props: { projectId: string }) {
  const { projectId } = props;

  // Grouping mode state
  const [groupByMode, setGroupByMode] = useState<GroupByMode>('run');
  const [bucketSize, setBucketSize] = useState<BucketSize>(3600); // Default to 1 hour

  // Group spans state
  const [groupSpansMap, setGroupSpansMap] = useState<Record<number, Span[]>>({});
  const [loadingGroupsByTimeBucket, setLoadingGroupsByTimeBucket] = useState<Set<number>>(new Set());

  // Refs to track latest state values for guard checks
  const groupSpansMapRef = useRef(groupSpansMap);
  const loadingGroupsByTimeBucketRef = useRef(loadingGroupsByTimeBucket);

  // Sync refs with state
  useEffect(() => {
    groupSpansMapRef.current = groupSpansMap;
  }, [groupSpansMap]);

  useEffect(() => {
    loadingGroupsByTimeBucketRef.current = loadingGroupsByTimeBucket;
  }, [loadingGroupsByTimeBucket]);

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

  // Use the groups pagination hook
  const {
    groups,
    groupsLoading,
    groupsError,
    refreshGroups,
    loadMoreGroups,
    hasMoreGroups,
    groupsTotal,
    loadingMoreGroups,
    openGroups,
    setOpenGroups,
  } = useGroupsPagination({
    projectId,
    bucketSize,
    onGroupsLoaded: () => {
      // Optional: Handle groups loaded
    },
  });

  // Load spans for a specific time bucket
  const loadGroupSpans = useCallback(async (timeBucket: number) => {
    // Check if already loading (use ref to get latest value)
    if (loadingGroupsByTimeBucketRef.current.has(timeBucket)) {
      console.log('Already loading group:', timeBucket);
      return;
    }

    // Check if already loaded (use ref to get latest value)
    if (timeBucket in groupSpansMapRef.current) {
      console.log('Group already loaded:', timeBucket);
      return;
    }

    console.log('Loading group spans for bucket:', timeBucket);
    setLoadingGroupsByTimeBucket(prev => new Set(prev).add(timeBucket));

    try {
      const response = await fetchGroupSpans({
        timeBucket,
        projectId,
        bucketSize,
        limit: 100,
        offset: 0,
      });
      console.log('Fetched group spans:', response.data.length, 'spans for bucket', timeBucket);

      // Store ALL spans (root + children) directly from the backend
      setGroupSpansMap(prev => ({
        ...prev,
        [timeBucket]: response.data,
      }));
    } catch (error: any) {
      console.error('Failed to fetch group spans:', error);
      toast.error("Failed to load group spans", {
        description: error.message || "An error occurred while loading group spans",
      });
    } finally {
      setLoadingGroupsByTimeBucket(prev => {
        const newSet = new Set(prev);
        newSet.delete(timeBucket);
        return newSet;
      });
    }
  }, [projectId, bucketSize]);

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

      if((event.type === 'RunFinished' || event.type === 'RunError') && event.run_id) {
        setTimeout(() => {
          event.run_id && fetchSpansByRunId(event.run_id);
        }, 100)
      }

    }
  }, [flattenSpans]);
  useDebugControl({ handleEvent, channel_name: 'debug-traces-timeline-events' });
  // Trace expansion state


  return {
    projectId,
    // Grouping mode
    groupByMode,
    setGroupByMode,
    bucketSize,
    setBucketSize,
    // Runs data (for 'run' mode)
    runs,
    runsLoading,
    runsError,
    refreshRuns,
    loadMoreRuns,
    hasMoreRuns,
    runsTotal,
    loadingMoreRuns,
    // Groups data (for 'bucket' mode)
    groups,
    groupsLoading,
    groupsError,
    refreshGroups,
    loadMoreGroups,
    hasMoreGroups,
    groupsTotal,
    loadingMoreGroups,
    openGroups,
    setOpenGroups,
    // Group spans loading
    loadGroupSpans,
    groupSpansMap,
    loadingGroupsByTimeBucket,
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