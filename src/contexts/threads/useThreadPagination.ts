import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { queryThreads } from "@/services/threads-api";
import {  ThreadChangesState } from "./types";
import { ThreadState } from "./useThreadState";

export function useThreadPagination(
  projectId: string,
  threadState: ThreadState,
  threadChangesState: ThreadChangesState
) {
  const { setThreads } = threadState;
  const { setThreadsHaveChanges } = threadChangesState;

  const [total, setTotal] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [loadingThreadsError, setLoadingThreadsError] = useState<string | null>(
    null
  );
  // Use ref for offset to ensure we always have the current value synchronously
  const offsetRef = useRef<number>(0);
  // Ref for synchronous guard against concurrent loadMoreThreads calls
  const isLoadingMoreRef = useRef(false);
  const refreshThreads = useCallback(async () => {
    setLoading(true);
    offsetRef.current = 0;
    setHasMore(true);
    try {
      const response = await queryThreads(projectId, {
        order_by: [["updated_at", "desc"]],
        limit: 100,
        offset: 0,
      });
      const pagination = response.pagination;
      const newThreads = response.data;
      setThreads(newThreads);
      setThreadsHaveChanges({});
      setTotal(pagination.total);
      offsetRef.current = pagination.offset + newThreads.length;
      setHasMore(pagination.limit + pagination.offset < pagination.total);
      setLoadingThreadsError(null);
    } catch (e: any) {
      const errorMessage = e.message || "Failed to load threads";
      setLoadingThreadsError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [projectId, setThreads, setThreadsHaveChanges]);

  const loadMoreThreads = useCallback(async () => {
    // Synchronous guard - prevents concurrent calls
    if (isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setLoadingMore(true);

    const currentOffset = offsetRef.current;

    try {
      const response = await queryThreads(projectId, {
        order_by: [["updated_at", "desc"]],
        limit: 100,
        offset: currentOffset,
      });
      const pagination = response.pagination;
      setThreads((prev) => [...prev, ...response.data]);
      offsetRef.current = currentOffset + response.data.length;
      setTotal(pagination.total);
      setHasMore(response.data.length === pagination.limit);
    } catch (e: any) {
      const errorMessage = e.message || "Failed to load more threads";
      setLoadingThreadsError(errorMessage);
    } finally {
      setLoadingMore(false);
      isLoadingMoreRef.current = false;
    }
  }, [projectId, setThreads]);

  return {
    offset: offsetRef.current,
    total,
    hasMore,
    loading,
    loadingMore,
    loadingThreadsError,
    refreshThreads,
    loadMoreThreads,
  };
}
