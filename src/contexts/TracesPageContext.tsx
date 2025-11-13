import { createContext, useContext, ReactNode, useCallback, useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router";
import { useDebugControl } from "@/hooks/events/useDebugControl";
import { ProjectEventUnion } from "./project-events/dto";
import { processEvent, updatedRunWithSpans } from "@/hooks/events/utilities";
import { useWrapperHook } from "@/hooks/useWrapperHook";
import { Span } from "@/types/common-type";
import { useGroupsPagination } from "@/hooks/useGroupsPagination";
import { fetchGroupSpans, fetchSingleGroup, fetchBatchGroupSpans, GenericGroupDTO, isTimeGroup, isThreadGroup, isRunGroup } from "@/services/groups-api";
import { toast } from "sonner";
import { tryParseJson } from "@/utils/modelUtils";
import { getGroupKey } from "./utils";

export type TracesPageContextType = ReturnType<typeof useTracesPageContext>;

const TracesPageContext = createContext<TracesPageContextType | undefined>(undefined);

export type GroupByMode = 'run' | 'time' | 'thread';
export type Duration = 300 | 600 | 1200 | 1800 | 3600 | 7200 | 10800 | 21600 | 43200 | 86400; // 5m, 10m, 20m, 30m, 1h, 2h, 3h, 6h, 12h, 24h

// Allowed query params for traces page
const ALLOWED_QUERY_PARAMS = ['tab', 'group_by', 'duration', 'page'] as const;


export function useTracesPageContext(props: { projectId: string }) {
  const { projectId } = props;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Initialize from URL first, then localStorage, then default
  const [groupByMode, setGroupByMode] = useState<GroupByMode>(() => {
    // 1. Check URL query param (highest priority - for sharing links)
    const urlMode = searchParams.get('group_by') as GroupByMode | null;
    if (urlMode === 'run' || urlMode === 'time' || urlMode === 'thread') {
      return urlMode;
    }

    // 2. Check localStorage (for returning users)
    const stored = localStorage.getItem('vllora-traces-groupByMode');
    if (stored === 'run' || stored === 'time' || stored === 'thread') {
      return stored;
    }

    // 3. Default value
    return 'time';
  });

  const [duration, setDuration] = useState<Duration>(() => {
    // 1. Check URL query param
    const urlSize = searchParams.get('duration');
    if (urlSize) {
      const parsed = parseInt(urlSize, 10);
      if ([300, 600, 1200, 1800, 3600, 7200, 10800, 21600, 43200, 86400].includes(parsed)) {
        return parsed as Duration;
      }
    }

    // 2. Check localStorage
    const stored = localStorage.getItem('vllora-traces-duration');
    if (stored) {
      const parsed = parseInt(stored, 10);
      if ([300, 600, 1200, 1800, 3600, 7200, 10800, 21600, 43200, 86400].includes(parsed)) {
        return parsed as Duration;
      }
    }

    // 3. Default value
    return 300;
  });

  // Sync to both URL and localStorage when state changes (without page)
  useEffect(() => {
    // Get current URL params directly from window.location to avoid stale reads
    const currentParams = new URLSearchParams(window.location.search);
    const newParams = new URLSearchParams();

    // Preserve only allowed params from current URL
    ALLOWED_QUERY_PARAMS.forEach(param => {
      const value = currentParams.get(param);
      if (value && param !== 'group_by' && param !== 'duration') {
        newParams.set(param, value);
      }
    });

    // Set our managed params
    newParams.set('group_by', groupByMode);

    // Preserve the current tab value from URL, or default to 'threads'
    newParams.set('tab', 'traces');

    // Only include duration in URL when in time mode
    if (groupByMode === 'time') {
      newParams.set('duration', String(duration));
    }
    navigate(`${location.pathname}?${newParams.toString()}`, { replace: true });

    // Update localStorage for persistence (always store duration)
    localStorage.setItem('vllora-traces-groupByMode', groupByMode);
    localStorage.setItem('vllora-traces-duration', String(duration));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupByMode, duration]);

  // Loading state for groups - supports all group types
  const [loadingGroups, setLoadingGroups] = useState<Set<string>>(new Set());
  const loadingGroupsRef = useRef(loadingGroups);

  // Sync ref with state
  useEffect(() => {
    loadingGroupsRef.current = loadingGroups;
  }, [loadingGroups]);

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

  // Get initial page from URL
  const initialPage = (() => {
    const pageParam = searchParams.get('page');
    if (pageParam) {
      const parsed = parseInt(pageParam, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 1;
  })();

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
    hideGroups,
    setHideGroups,
    goToPage: goToPageInternal,
    goToPreviousPage: goToPreviousPageInternal,
    currentPage,
    // openGroups,
    // setOpenGroups,
  } = useGroupsPagination({
    projectId,
    bucketSize: duration, // Map duration to bucketSize for API
    groupBy: groupByMode === 'time' ? 'time' : groupByMode === 'thread' ? 'thread' : groupByMode === 'run' ? 'run' : 'time',
    initialPage,
    onGroupsLoaded: async (groups) => {
      // Single batched request for all groups - cleaner and more efficient
      if (groups && groups.length > 0) {
        const groupKeys: string[] = [];

        try {
          // Convert groups to batch request format
          const groupIdentifiers = groups.map(group => {
            if (isTimeGroup(group)) {
              return {
                groupBy: 'time' as const,
                timeBucket: group.group_key.time_bucket,
                bucketSize: duration, // Map duration to bucketSize for API
              };
            } else if (isThreadGroup(group)) {
              return {
                groupBy: 'thread' as const,
                threadId: group.group_key.thread_id,
              };
            } else if (isRunGroup(group)) {
              return {
                groupBy: 'run' as const,
                runId: group.group_key.run_id,
              };
            }
            return null;
          }).filter((id): id is NonNullable<typeof id> => id !== null);

          // Collect group keys that need loading
          groupKeys.push(...groups.map(g => getGroupKey(g))
            .filter((key): key is NonNullable<typeof key> => key !== null)
            .filter((key) => !loadingGroupsRef.current.has(key)));

          // Mark groups as loading
          setLoadingGroups(prev => {
            const newSet = new Set(prev);
            groupKeys.forEach(key => newSet.add(key));
            return newSet;
          });

          // Single batch request for all groups
          const response = await fetchBatchGroupSpans({
            projectId,
            groups: groupIdentifiers,
            spansPerGroup: 100,
          });

          // Flatten all spans from response
          const allSpans = Object.values(response.data).flatMap(g => g.spans);
          updateBySpansArray(allSpans);
        } catch (error: any) {
          toast.error("Failed to load group spans", {
            description: error.message || "An error occurred while loading group spans",
          });
        } finally {
          // Clean up loading state
          setLoadingGroups(prev => {
            const newSet = new Set(prev);
            groupKeys.forEach(key => newSet.delete(key));
            return newSet;
          });
        }
      }
    },
  });

  // Compute groupSpansMap from flattenSpans (similar to runMap pattern)
  // This groups spans by their time bucket based on duration
  const groupSpansMap = useMemo(() => {
    const bucket_size_us = duration * 1_000_000;
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
  }, [flattenSpans, duration]);

  // Compute threadSpansMap from flattenSpans
  const threadSpansMap = useMemo(() => {
    return flattenSpans.reduce((acc, span) => {
      if (span.thread_id) {
        if (!acc[span.thread_id]) {
          acc[span.thread_id] = [];
        }
        acc[span.thread_id].push(span);
      }
      return acc;
    }, {} as Record<string, Span[]>);
  }, [flattenSpans]);

  // Compute runSpansMap from flattenSpans
  const runSpansMap = useMemo(() => {
    return flattenSpans.reduce((acc, span) => {
      if (span.run_id) {
        if (!acc[span.run_id]) {
          acc[span.run_id] = [];
        }
        acc[span.run_id].push(span);
      }
      return acc;
    }, {} as Record<string, Span[]>);
  }, [flattenSpans]);

  // Reset to page 1 when filters change
  useEffect(() => {
    if (currentPage !== 1) {
      goToPageInternal(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupByMode, duration]);

  // Sync current page to URL
  useEffect(() => {
    // Get current URL params directly from window.location to avoid stale reads
    const newParams = new URLSearchParams(window.location.search);

    if (currentPage > 1) {
      newParams.set('page', String(currentPage));
    } else {
      newParams.delete('page');
    }

    navigate(`${location.pathname}?${newParams.toString()}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // Wrapper functions that update URL when navigating pages
  const goToPage = useCallback((pageNumber: number) => {
    goToPageInternal(pageNumber);
  }, [goToPageInternal]);

  const goToPreviousPage = useCallback(() => {
    goToPreviousPageInternal();
  }, [goToPreviousPageInternal]);

  // Refresh a single group's stats from backend (works for time/thread/run)
  const refreshSingleGroupStat = useCallback(async (group: GenericGroupDTO) => {
    try {
      let updatedGroup: GenericGroupDTO | null = null;

      if (isTimeGroup(group)) {
        updatedGroup = await fetchSingleGroup({
          projectId,
          groupBy: 'time',
          timeBucket: group.group_key.time_bucket,
          bucketSize: duration, // Map duration to bucketSize for API
        });
      } else if (isThreadGroup(group)) {
        updatedGroup = await fetchSingleGroup({
          projectId,
          groupBy: 'thread',
          threadId: group.group_key.thread_id,
        });
      } else if (isRunGroup(group)) {
        updatedGroup = await fetchSingleGroup({
          projectId,
          groupBy: 'run',
          runId: group.group_key.run_id,
        });
      }

      if (updatedGroup) {
        setGroups(prev => prev.map(g => {
          // Match by group key
          if (isTimeGroup(g) && isTimeGroup(updatedGroup) &&
            g.group_key.time_bucket === updatedGroup.group_key.time_bucket) {
            return updatedGroup;
          } else if (isThreadGroup(g) && isThreadGroup(updatedGroup) &&
            g.group_key.thread_id === updatedGroup.group_key.thread_id) {
            return updatedGroup;
          } else if (isRunGroup(g) && isRunGroup(updatedGroup) &&
            g.group_key.run_id === updatedGroup.group_key.run_id) {
            return updatedGroup;
          }
          return g;
        }));
      }
    } catch (error) {
      console.error('Failed to refresh group stats:', error);
    }
  }, [projectId, duration, setGroups]);

  // Load spans for any group type using unified API
  const loadGroupSpans = useCallback(async (group: GenericGroupDTO) => {
    // Create a unique key for this group
    const groupKey = getGroupKey(group);
    if (!groupKey) {
      return; // Unknown group type
    }

    // Check if already loading (use ref to get latest value)
    if (loadingGroupsRef.current.has(groupKey)) {
      return;
    }

    setLoadingGroups(prev => new Set(prev).add(groupKey));

    try {
      let response;

      if (isTimeGroup(group)) {
        response = await fetchGroupSpans({
          projectId,
          groupBy: 'time',
          timeBucket: group.group_key.time_bucket,
          bucketSize: duration, // Map duration to bucketSize for API
          limit: 100,
          offset: 0,
        });
      } else if (isThreadGroup(group)) {
        response = await fetchGroupSpans({
          projectId,
          groupBy: 'thread',
          threadId: group.group_key.thread_id,
          limit: 100,
          offset: 0,
        });
      } else if (isRunGroup(group)) {
        // For run groups, use the unified API
        response = await fetchGroupSpans({
          projectId,
          groupBy: 'run',
          runId: group.group_key.run_id,
          limit: 100,
          offset: 0,
        });
      }

      if (response) {
        // Add fetched spans to flattenSpans - groupSpansMap will auto-update via useMemo
        updateBySpansArray(response.data);
      }
    } catch (error: any) {
      toast.error("Failed to load group spans", {
        description: error.message || "An error occurred while loading group spans",
      });
    } finally {
      setLoadingGroups(prev => {
        const newSet = new Set(prev);
        newSet.delete(groupKey);
        return newSet;
      });
    }
  }, [projectId, duration, updateBySpansArray]);

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

  // Handle events for run mode
  const handleRunModeEvent = useCallback((event: ProjectEventUnion) => {
    if (!event.run_id) return;

    setTimeout(() => {
      setFlattenSpans(prevSpans => {
        const newFlattenSpans = processEvent(prevSpans, event);
        // Update run metrics with the new spans
        event.run_id && updateRunMetrics(event.run_id, newFlattenSpans);
        return newFlattenSpans;
      });

      event.run_id && setSelectedRunId(event.run_id);
      event.run_id && setOpenTraces([{ run_id: event.run_id, tab: 'trace' }]);
    }, 0);

    // Fetch spans when run finishes
    if ((event.type === 'RunFinished' || event.type === 'RunError') && event.run_id) {
      setTimeout(() => {
        event.run_id && fetchSpansByRunId(event.run_id);
      }, 100);
    }
  }, [updateRunMetrics, setFlattenSpans, setSelectedRunId, setOpenTraces, fetchSpansByRunId]);

  // Handle events for time/bucket mode
  const handleTimeModeEvent = useCallback((event: ProjectEventUnion) => {
    let capturedNewSpan: any = null;
    let capturedTimeBucket: number | null = null;

    // 1. Update flattenSpans and capture time bucket
    setFlattenSpans(prevSpans => {
      const updatedSpans = processEvent(prevSpans, event);
      const newSpan = updatedSpans.find(s => !prevSpans.find(cs => cs.span_id === s.span_id));

      if (newSpan && newSpan.start_time_us) {
        const bucket_size_us = duration * 1_000_000;
        const timeBucket = Math.floor(newSpan.start_time_us / bucket_size_us) * bucket_size_us;
        capturedNewSpan = newSpan;
        capturedTimeBucket = timeBucket;
      }

      return updatedSpans;
    });

    // 2. Create optimistic time group if needed
    if (capturedNewSpan && capturedTimeBucket !== null) {
      const newSpan = capturedNewSpan;
      const timeBucket = capturedTimeBucket;

      setGroups(prev => {
        // Check if group already exists
        const groupExists = prev.some(g =>
          isTimeGroup(g) && g.group_key.time_bucket === timeBucket
        );

        if (groupExists) {
          return prev;
        }

        // Create optimistic time group
        const optimisticGroup: GenericGroupDTO = {
          group_by: 'time',
          group_key: { time_bucket: timeBucket },
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

        const updated = [...prev, optimisticGroup];
        // Sort by time bucket (descending)
        return updated.sort((a, b) => {
          const aTime = isTimeGroup(a) ? a.group_key.time_bucket : a.start_time_us;
          const bTime = isTimeGroup(b) ? b.group_key.time_bucket : b.start_time_us;
          return bTime - aTime;
        });
      });
    }

    // 3. Refresh group stats when run finishes
    if ((event.type === 'RunFinished' || event.type === 'RunError') && capturedTimeBucket !== null) {
      setTimeout(() => {
        const timeBucket = capturedTimeBucket;
        setGroups(prev => {
          const group = prev.find(g =>
            isTimeGroup(g) && g.group_key.time_bucket === timeBucket
          );

          if (group) {
            setTimeout(() => {
              refreshSingleGroupStat(group);
            }, 1000);
            loadGroupSpans(group);
          }
          return prev;
        });
      }, 100);
    }
  }, [duration, setFlattenSpans, setGroups, refreshSingleGroupStat, loadGroupSpans]);

  // Handle events for thread mode
  const handleThreadModeEvent = useCallback((event: ProjectEventUnion) => {
    let capturedNewSpan: any = null;
    let capturedThreadId = event.thread_id;

    // 1. Update flattenSpans and capture thread ID
    setFlattenSpans(prevSpans => {
      const updatedSpans = processEvent(prevSpans, event);
      const newSpan = updatedSpans.find(s => !prevSpans.find(cs => cs.span_id === s.span_id));

      if (newSpan && newSpan.thread_id) {
        capturedNewSpan = newSpan;
      }

      return updatedSpans;
    });

    // 2. Create optimistic thread group if needed
    if (capturedNewSpan && capturedThreadId) {
      const newSpan = capturedNewSpan;
      const threadId = capturedThreadId;

      setGroups(prev => {
        // Check if group already exists
        const groupExists = prev.some(g =>
          isThreadGroup(g) && g.group_key.thread_id === threadId
        );

        if (groupExists) {
          return prev;
        }

        // Create optimistic thread group
        const optimisticGroup: GenericGroupDTO = {
          group_by: 'thread',
          group_key: { thread_id: threadId },
          thread_ids: [threadId],
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

        const updated = [...prev, optimisticGroup];
        // Sort by start time (descending)
        return updated.sort((a, b) => b.start_time_us - a.start_time_us);
      });
    }

    if (event.type === 'Custom' && event.event.type === 'span_end' && event.event.operation_name === 'api_invoke') {
      const eventApiInvoke = event.event
      let apiInvokAtt = eventApiInvoke.attributes
      let requestStr = apiInvokAtt?.['request']
      let requestJson = tryParseJson(requestStr)
      if (requestJson?.model) {
        setGroups(prev => {
          const groupIndex = prev.findIndex(g =>
            isThreadGroup(g) && g.group_key.thread_id === capturedThreadId
          );
          if (groupIndex !== -1) {
            let requestModelsGroup = prev[groupIndex].request_models
            let usedModelsGroup = prev[groupIndex].used_models

            requestModelsGroup.push(requestJson.model)
            let uniqueRequestModelsGroup = Array.from(new Set(requestModelsGroup))
            usedModelsGroup.push(requestJson.model)
            let uniqueUsedModelsGroup = Array.from(new Set(usedModelsGroup))
            let result = [...prev]
            result[groupIndex].request_models = uniqueRequestModelsGroup
            result[groupIndex].used_models = uniqueUsedModelsGroup
            if (result[groupIndex].llm_calls < uniqueUsedModelsGroup.length) {
              result[groupIndex].llm_calls = uniqueUsedModelsGroup.length
            }
            return result
          }
          return prev
        })
      }

    }

    // 3. Refresh group stats when run finishes
    if ((event.type === 'RunFinished' || event.type === 'RunError') && capturedThreadId) {
      setTimeout(() => {
        const threadId = capturedThreadId;
        setGroups(prev => {
          const group = prev.find(g =>
            isThreadGroup(g) && g.group_key.thread_id === threadId
          );

          if (group) {
            setTimeout(() => {
              refreshSingleGroupStat(group);
            }, 4000);
            loadGroupSpans(group);
          }
          return prev;
        });
      }, 100);
    }
  }, [setFlattenSpans, setGroups, refreshSingleGroupStat, loadGroupSpans]);

  // Main event handler - dispatches to mode-specific handlers
  const handleEvent = useCallback((event: ProjectEventUnion) => {
    if (!event.run_id) return;

    switch (groupByMode) {
      case 'run':
        handleRunModeEvent(event);
        break;
      case 'time':
        handleTimeModeEvent(event);
        break;
      case 'thread':
        handleThreadModeEvent(event);
        break;
    }
  }, [groupByMode, handleRunModeEvent, handleTimeModeEvent, handleThreadModeEvent]);



  useDebugControl({ handleEvent, channel_name: 'debug-traces-timeline-events' });
  // Trace expansion state


  return {
    projectId,
    // Grouping mode
    groupByMode,
    setGroupByMode,
    duration,
    setDuration,
    // Runs data (for 'run' mode)
    runs,
    runsLoading,
    runsError,
    refreshRuns,
    loadMoreRuns,
    hasMoreRuns,
    runsTotal,
    loadingMoreRuns,
    // Groups data (for 'time' mode)
    groups,
    groupsLoading,
    groupsError,
    refreshGroups,
    loadMoreGroups,
    hasMoreGroups,
    groupsTotal,
    loadingMoreGroups,
    hideGroups,
    setHideGroups,
    goToPage,
    goToPreviousPage,
    currentPage,
    // openGroups,
    // setOpenGroups,
    // Group spans loading
    loadGroupSpans,
    refreshSingleGroupStat,
    groupSpansMap,
    threadSpansMap,
    runSpansMap,
    loadingGroups,
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