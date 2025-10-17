import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { RunDTO } from '@/types/common-type';
import { listRuns, ListRunsQuery } from '@/services/runs-api';

export interface UseRunPaginationOptions {
  projectId: string;
  initialParams?: Omit<ListRunsQuery, 'offset' | 'limit'>;
}

export function useRunPagination({ projectId, initialParams = {} }: UseRunPaginationOptions) {
  const [runs, setRuns] = useState<RunDTO[]>([]);
  const [offset, setOffset] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize initialParams to prevent infinite loops
  const memoizedParams = useMemo(() => initialParams, [JSON.stringify(initialParams)]);

  const refreshRuns = useCallback(async () => {
    setLoading(true);
    setOffset(0);
    setHasMore(true);
    try {
      const response = await listRuns({
        projectId,
        params: {
          ...memoizedParams,
          limit: 100,
          offset: 0,
        },
      });

      setRuns(response.data);
      setTotal(response.pagination.total);
      setOffset(response.pagination.offset + response.data.length);
      setHasMore(
        response.pagination.limit + response.pagination.offset < response.pagination.total
      );
      setError(null);
    } catch (e: any) {
      const errorMessage = e.message || 'Failed to load runs';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [projectId, memoizedParams]);

  const loadMoreRuns = useCallback(async () => {
    setLoadingMore((currentLoadingMore) => {
      if (currentLoadingMore) return true;

      // Use functional updates to get current values
      setLoading((currentLoading) => {
        if (currentLoading) {
          setLoadingMore(false);
          return currentLoading;
        }

        setHasMore((currentHasMore) => {
          if (!currentHasMore) {
            setLoadingMore(false);
            return currentHasMore;
          }

          // Proceed with loading
          setOffset((currentOffset) => {
            listRuns({
              projectId,
              params: {
                ...memoizedParams,
                limit: 100,
                offset: currentOffset,
              },
            })
              .then((response) => {
                const pagination = response.pagination;
                setRuns((prev) => [...prev, ...response.data]);
                setOffset((prev) => prev + response.data.length);
                setTotal((prev) => prev + response.data.length);
                setHasMore(response.data.length === pagination.limit);
                setLoadingMore(false);
              })
              .catch((e: any) => {
                const errorMessage = e.message || 'Failed to load more runs';
                setError(errorMessage);
                setLoadingMore(false);
              });

            return currentOffset;
          });

          return currentHasMore;
        });

        return currentLoading;
      });

      return true;
    });
  }, [projectId, memoizedParams]);

  return {
    runs,
    offset,
    total,
    hasMore,
    loading,
    loadingMore,
    error,
    refreshRuns,
    loadMoreRuns,
  };
}
