import { useState, useCallback } from "react";
import { toast } from "sonner";
import { queryThreads } from "@/services/threads-api";
import {  ThreadChangesState } from "./types";
import { Thread } from "@/types/chat";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { ThreadState } from "./useThreadState";

export function useThreadPagination(
  projectId: string,
  threadState: ThreadState,
  threadChangesState: ThreadChangesState
) {
  const { setThreads } = threadState;
  const { setThreadsHaveChanges } = threadChangesState;

  const [offset, setOffset] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [loadingThreadsError, setLoadingThreadsError] = useState<string | null>(
    null
  );
  const navigate = useNavigate();

  const refreshThreads = useCallback(async () => {
    setLoading(true);
    setOffset(0);
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
      if (newThreads.length === 0) {
        setTimeout(() => {
          const now = Date.now() * 1000; // Convert to microseconds
          const newThreadId = uuidv4();

          const newThread: Thread = {
            thread_id: newThreadId,
            start_time_us: now,
            finish_time_us: now,
            run_ids: [],
            input_models: ["openai/gpt-4.1-nano"],
            cost: 0,
            is_from_local: true,
          };
          setThreads([newThread]);
          // Navigate to the new thread with model in URL and project_id (only if not default)
          const params = new URLSearchParams();
          params.set("threadId", newThread.thread_id);
          params.set("model", "openai/gpt-4.1-nano");
          navigate(`/chat?${params.toString()}`);
        }, 10);
      }
      setThreadsHaveChanges({});
      setTotal(pagination.total);
      setOffset(pagination.offset + newThreads.length);
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
            queryThreads(projectId, {
              order_by: [["updated_at", "desc"]],
              limit: 100,
              offset: currentOffset,
            })
              .then((response) => {
                const pagination = response.pagination;
                setThreads((prev) => [...prev, ...response.data]);
                setOffset((prev) => prev + response.data.length);
                setTotal((prev) => prev + response.data.length);
                setHasMore(response.data.length === pagination.limit);
                setLoadingMore(false);
              })
              .catch((e: any) => {
                const errorMessage = e.message || "Failed to load more threads";
                setLoadingThreadsError(errorMessage);
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
  }, [projectId, setThreads]);

  return {
    offset,
    total,
    hasMore,
    loading,
    loadingMore,
    loadingThreadsError,
    refreshThreads,
    loadMoreThreads,
  };
}
