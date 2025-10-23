import { useState, useCallback } from 'react';
import { useRequest, useLatest } from 'ahooks';
import { toast } from 'sonner';
import { listRuns } from '@/services/runs-api';
import { RunDTO } from '@/types/common-type';

const LIMIT_LOADING_RUNS = 20;

interface UseRunsPaginationParams {
  projectId: string;
  threadId?: string; // Optional - for filtering by thread
}

export function useRunsPagination({ projectId, threadId }: UseRunsPaginationParams) {
  // Pagination state for runs
  const [runsOffset, setRunsOffset] = useState<number>(0);
  const [runsTotal, setRunsTotal] = useState<number>(0);
  const [hasMoreRuns, setHasMoreRuns] = useState<boolean>(false);
  const [loadingMoreRuns, setLoadingMoreRuns] = useState<boolean>(false);
  const [rawRuns, setRawRuns] = useState<RunDTO[]>([]);
const [openTraces, setOpenTraces] = useState<
    { run_id: string; tab: "trace" | "code" }[]
  >([]);
  const projectIdRef = useLatest(projectId);
  const threadIdRef = useLatest(threadId);

  // Use ahooks useRequest for fetching runs (initial load)
  const {
    loading: runsLoading,
    error: runsError,
    run: triggerRefreshRuns,
  } = useRequest(
    async () => {
      if (!projectId) {
        return { data: [], pagination: { offset: 0, limit: 0, total: 0 } };
      }
      const response = await listRuns({
        projectId,
        params: {
          ...(threadId ? { threadIds: threadId } : {}),
          limit: LIMIT_LOADING_RUNS,
          offset: 0,
        },
      });
      // Update pagination state
      const runs = response?.data || [];

     runs && runs.length> 0 && runs[0].run_id && setOpenTraces((prev) => {
        if(prev && prev.length  == 0){
          return [{
            run_id: runs[0].run_id!,
            tab: "trace"
          }]
        }
        return prev || [];
      })
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
          ...(threadIdRef.current ? { threadIds: threadIdRef.current } : {}),
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

  // Refresh runs function (reset and reload from beginning)
  const refreshRuns = useCallback(() => {
    setRunsOffset(0);
    setRunsTotal(0);
    setHasMoreRuns(false);
    setRawRuns([]);
    triggerRefreshRuns();
  }, []);

  return {
    runs: rawRuns,
    setRuns: setRawRuns,
    runsLoading,
    runsError,
    refreshRuns,
    loadMoreRuns,
    hasMoreRuns,
    runsTotal,
    loadingMoreRuns,
    openTraces,
    setOpenTraces,
  };
}
