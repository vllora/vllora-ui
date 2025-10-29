import { createContext, useContext, ReactNode, useCallback, useState, useRef, useEffect, useMemo } from "react";
import { useDebugControl } from "@/hooks/events/useDebugControl";
import { ProjectEventUnion } from "./project-events/dto";
import { processEvent, updatedRunWithSpans } from "@/hooks/events/utilities";
import { useWrapperHook } from "@/hooks/useWrapperHook";
import { Span } from "@/types/common-type";
import { useGroupsPagination } from "@/hooks/useGroupsPagination";
import { fetchSpansByBucketGroup, fetchSingleBucket, GroupDTO } from "@/services/groups-api";
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

  // Loading state for groups
  const [loadingGroupsByTimeBucket, setLoadingGroupsByTimeBucket] = useState<Set<number>>(new Set());
  const loadingGroupsByTimeBucketRef = useRef(loadingGroupsByTimeBucket);

  // Sync ref with state
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
    updateBySpansArray
  } = useWrapperHook({
    projectId, onRunsLoaded: (runs) => {
      if (runs && runs.length > 0 && runs[0].run_id) {
        fetchSpansByRunId(runs[0].run_id)
      }
    }
  });

  // Use the groups pagination hook
  const {
    groups,
    setGroups,
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
    onGroupsLoaded: (groups) => {
      if(groups && groups.length > 0 && groups[0].time_bucket) {
         loadSpansByBucketGroup(groups[0].time_bucket);
      }
    },
  });

  // Compute groupSpansMap from flattenSpans (similar to runMap pattern)
  // This groups spans by their time bucket based on bucketSize
  const groupSpansMap = useMemo(() => {
    const bucket_size_us = bucketSize * 1_000_000;
    return flattenSpans.reduce((acc, span) => {
      if (span.start_time_us) {
        const timeBucket = Math.floor(span.start_time_us / bucket_size_us) * bucket_size_us;
        if (!acc[timeBucket]) {
          acc[timeBucket] = [];
        }
        acc[timeBucket].push(span);
      }
      return acc;
    }, {} as Record<number, Span[]>);
  }, [flattenSpans, bucketSize]);

  // Refresh a single bucket's stats from backend
  const refreshSingleBucketStat = useCallback(async (timeBucket: number) => {
    try {
      const updatedBucket = await fetchSingleBucket({
        timeBucket,
        projectId,
        bucketSize,
      });

      if (updatedBucket) {
        setGroups(prev => prev.map(g =>
          g.time_bucket === timeBucket ? updatedBucket : g
        ));
        console.log('Refreshed bucket stats for:', timeBucket);
      }
    } catch (error) {
      console.error('Failed to refresh bucket stats:', error);
    }
  }, [projectId, bucketSize, setGroups]);

  // Load spans for a specific time bucket
  const loadSpansByBucketGroup = useCallback(async (timeBucket: number) => {
    // Check if already loading (use ref to get latest value)
    if (loadingGroupsByTimeBucketRef.current.has(timeBucket)) {
      return;
    }

    setLoadingGroupsByTimeBucket(prev => new Set(prev).add(timeBucket));

    try {
      const response = await fetchSpansByBucketGroup({
        timeBucket,
        projectId,
        bucketSize,
        limit: 100,
        offset: 0,
      });
      // Add fetched spans to flattenSpans - groupSpansMap will auto-update via useMemo
      updateBySpansArray(response.data);
    } catch (error: any) {
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
  }, [projectId, bucketSize, flattenSpans]);

  const updateRunMetrics = useCallback((run_id: string, updatedSpans: Span[]) => {
    setRuns(prevRuns => {
      let runById = prevRuns.find(r => r.run_id === run_id)
      if (!runById) {
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
      // Handle run mode
      if (groupByMode === 'run') {
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

        if ((event.type === 'RunFinished' || event.type === 'RunError') && event.run_id) {
          setTimeout(() => {
            event.run_id && fetchSpansByRunId(event.run_id);
          }, 100)
        }
      }
      // Handle bucket mode
      else if (groupByMode === 'bucket') {
        // Process the event to get the span
        const currentSpans = flattenSpans;
        const updatedSpans = processEvent(currentSpans, event);
        const newSpan = updatedSpans.find(s => !currentSpans.find(cs => cs.span_id === s.span_id));

        if (newSpan && newSpan.start_time_us) {
          // Calculate which bucket this span belongs to
          const bucket_size_us = bucketSize * 1_000_000;
          const timeBucket = Math.floor(newSpan.start_time_us / bucket_size_us) * bucket_size_us;

          // Check if this bucket exists in the groups list
          const bucketExists = groups.some(g => g.time_bucket === timeBucket);

          // If bucket doesn't exist, create an optimistic/fake bucket
          // We can't refresh yet because span isn't in DB yet
          if (!bucketExists) {
            const optimisticBucket: GroupDTO = {
              time_bucket: timeBucket,
              thread_ids: newSpan.thread_id ? [newSpan.thread_id] : [],
              trace_ids: [newSpan.trace_id],
              run_ids: newSpan.run_id ? [newSpan.run_id] : [],
              root_span_ids: newSpan.parent_span_id ? [] : [newSpan.span_id],
              request_models: [],
              used_models: [],
              llm_calls: 0,
              cost: 0,
              input_tokens: null,
              output_tokens: null,
              start_time_us: newSpan.start_time_us,
              finish_time_us: newSpan.finish_time_us || newSpan.start_time_us,
              errors: [],
            };
            // Add optimistic bucket to the groups list (sorted by time_bucket desc)
            setGroups(prev => {
              const updated = [...prev, optimisticBucket];
              return updated.sort((a, b) => b.time_bucket - a.time_bucket);
            });

            // Auto-open the new bucket so user can see the real-time span immediately
            setOpenGroups(prev => {
              // Check if already open
              if (prev.some(g => g.time_bucket === timeBucket)) {
                return prev;
              }
              // Add to opened groups
              return [{ time_bucket: timeBucket, tab: 'trace' }];
            });

            console.log('Auto-opened optimistic bucket:', timeBucket);
          }

          // Update flattenSpans - groupSpansMap will auto-compute from this
          setFlattenSpans(updatedSpans);
          console.log('Real-time span added, flattenSpans updated');
        }

        // Refresh bucket stats from backend when run finishes
        if (event.type === 'RunFinished' || event.type === 'RunError') {
          setTimeout(() => {
            if (newSpan && newSpan.start_time_us) {
              const bucket_size_us = bucketSize * 1_000_000;
              const timeBucket = Math.floor(newSpan.start_time_us / bucket_size_us) * bucket_size_us;
              refreshSingleBucketStat(timeBucket);
              loadSpansByBucketGroup(timeBucket);
            }
          }, 100);
        }
      }
    }
  }, [groupByMode, flattenSpans, bucketSize, openGroups, groups, setGroups, setOpenGroups, updateRunMetrics, fetchSpansByRunId, setFlattenSpans, setSelectedRunId, setOpenTraces, groupSpansMap, projectId, refreshSingleBucketStat]);
  
  
  
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
    loadGroupSpans: loadSpansByBucketGroup,
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