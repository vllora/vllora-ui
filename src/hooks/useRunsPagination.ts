import { useState, useCallback } from "react";
import { useRequest, useLatest } from "ahooks";
import { toast } from "sonner";
import { listRuns, getRunDetails as getRunDetailsApi } from "@/services/runs-api";
import { RunDTO } from "@/types/common-type";

const LIMIT_LOADING_RUNS = 20;

interface UseRunsPaginationParams {
  projectId: string;
  threadId?: string; // Optional - for filtering by thread
  labels?: string[]; // Optional - for filtering by labels (attribute.label)
  onRunsLoaded?: (runs: RunDTO[]) => void;
}

export function useRunsPagination({
  projectId,
  threadId,
  labels,
  onRunsLoaded,
}: UseRunsPaginationParams) {
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
  const labelsRef = useLatest(labels);

  // Use ahooks useRequest for fetching runs (initial load)
  const {
    loading: runsLoading,
    error: runsError,
    run: triggerRefreshRuns,
  } = useRequest(
    async () => {
      // Use refs to get latest values when called
      const currentProjectId = projectIdRef.current;
      const currentThreadId = threadIdRef.current;
      const currentLabels = labelsRef.current;

      if (!currentProjectId) {
        return { data: [], pagination: { offset: 0, limit: 0, total: 0 } };
      }
      const response = await listRuns({
        projectId: currentProjectId,
        params: {
          ...(currentThreadId ? { thread_ids: currentThreadId } : {}),
          ...(currentLabels && currentLabels.length > 0 ? { labels: currentLabels.join(',') } : {}),
          limit: LIMIT_LOADING_RUNS,
          offset: 0,
        },
      });
      // Update pagination state
      const runs = response?.data || [];

     
      if(runs && runs.length > 0 && runs[0].run_id){
         setOpenTraces([
          {
            run_id: runs[0].run_id!,
            tab: "trace",
          },
        ]);
      }
      onRunsLoaded?.(runs);
      const pagination = response?.pagination || {
        offset: 0,
        limit: 0,
        total: 0,
      };

      const newOffset = runs.length;
      const newHasMore = pagination.total > runs.length;

      setRunsTotal(pagination.total);
      setRunsOffset(newOffset);
      setHasMoreRuns(newHasMore);
      setRawRuns(runs);

      return response;
    },
    {
      manual: true,
      onError: (err) => {
        toast.error("Failed to load runs", {
          description: err.message || "An error occurred while loading runs",
        });
      },
    }
  );

  // Load more runs function
  const loadMoreRuns = useCallback(async () => {
    if (runsLoading || loadingMoreRuns || !hasMoreRuns || runsOffset === 0)
      return;

    setLoadingMoreRuns(true);
    try {
      const response = await listRuns({
        projectId: projectIdRef.current,
        params: {
          ...(threadIdRef.current ? { thread_ids: threadIdRef.current } : {}),
          ...(labelsRef.current && labelsRef.current.length > 0 ? { labels: labelsRef.current.join(',') } : {}),
          limit: LIMIT_LOADING_RUNS,
          offset: runsOffset,
        },
      });

      const runs = response?.data || [];
      const pagination = response?.pagination || {
        offset: 0,
        limit: 0,
        total: 0,
      };

      // Update pagination state
      const newOffset = runsOffset + runs.length;
      const newHasMore = pagination.total > newOffset;

      setRunsTotal(pagination.total);
      setRunsOffset(newOffset);
      setHasMoreRuns(newHasMore);
      setRawRuns((prev) => [...prev, ...runs]);
    } catch (err: any) {
      toast.error("Failed to load more runs", {
        description: err.message || "An error occurred while loading more runs",
      });
    } finally {
      setLoadingMoreRuns(false);
    }
  }, [
    runsLoading,
    loadingMoreRuns,
    hasMoreRuns,
    runsOffset,
    threadIdRef,
    projectIdRef,
    labelsRef,
  ]);

  // Refresh runs function (reset and reload from beginning)
  const refreshRuns = useCallback(() => {
    setRunsOffset(0);
    setRunsTotal(0);
    setHasMoreRuns(false);
    triggerRefreshRuns();
  }, [triggerRefreshRuns]);

  // Get run details and update rawRuns by run_id
  const getRunDetails = useCallback(
    async (runId: string) => {
      try {
        const runDetails = await getRunDetailsApi({
          runId,
          projectId: projectIdRef.current,
        });

        setRawRuns((prev) =>
          prev.map((run) => (run.run_id === runId ? runDetails : run))
        );

        return runDetails;
      } catch (err: any) {
        toast.error("Failed to get run details", {
          description: err.message || "An error occurred while fetching run details",
        });
        throw err;
      }
    },
    [projectIdRef]
  );

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
    getRunDetails,
  };
}
