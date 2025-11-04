import { useState, useCallback } from "react";
import { useRequest, useLatest } from "ahooks";
import { toast } from "sonner";
import { listGroups, GenericGroupDTO } from "@/services/groups-api";

const LIMIT_LOADING_GROUPS = 20;

// Hide/collapse state for groups - supports all group types
export type HideGroupKey =
  | { type: 'time'; time_bucket: number }
  | { type: 'thread'; thread_id: string }
  | { type: 'run'; run_id: string };

interface UseGroupsPaginationParams {
  projectId: string;
  bucketSize: number; // In seconds (e.g., 3600 for 1 hour)
  groupBy?: 'time' | 'thread' | 'run'; // Grouping mode (default: 'time')
  threadId?: string; // Optional - for filtering by thread
  onGroupsLoaded?: (groups: GenericGroupDTO[]) => void;
}

export function useGroupsPagination({
  projectId,
  bucketSize,
  groupBy = 'time',
  threadId,
  onGroupsLoaded,
}: UseGroupsPaginationParams) {
  // Pagination state for groups
  const [groupsOffset, setGroupsOffset] = useState<number>(0);
  const [groupsTotal, setGroupsTotal] = useState<number>(0);
  const [hasMoreGroups, setHasMoreGroups] = useState<boolean>(false);
  const [loadingMoreGroups, setLoadingMoreGroups] = useState<boolean>(false);
  const [rawGroups, setRawGroups] = useState<GenericGroupDTO[]>([]);
  const [hideGroups, setHideGroups] = useState<HideGroupKey[]>([]);
  const projectIdRef = useLatest(projectId);
  const threadIdRef = useLatest(threadId);
  const bucketSizeRef = useLatest(bucketSize);
  const groupByRef = useLatest(groupBy);

  // Use ahooks useRequest for fetching groups (initial load)
  const {
    loading: groupsLoading,
    error: groupsError,
    run: triggerRefreshGroups,
  } = useRequest(
    async () => {
      if (!projectId) {
        return { data: [], pagination: { offset: 0, limit: 0, total: 0 } };
      }
      const response = await listGroups({
        projectId,
        params: {
          groupBy,
          ...(threadId ? { threadIds: threadId } : {}),
          ...(groupBy === 'time' ? { bucketSize } : {}),
          limit: LIMIT_LOADING_GROUPS,
          offset: 0,
        },
      });
      // Update pagination state
      const groups = response?.data || [];

      // if (groups && groups.length > 0 && groups[0].time_bucket) {
      //   setOpenGroups([
      //     {
      //       time_bucket: groups[0].time_bucket,
      //       tab: "trace",
      //     },
      //   ]);
      // }
      onGroupsLoaded?.(groups);
      const pagination = response?.pagination || {
        offset: 0,
        limit: 0,
        total: 0,
      };

      const newOffset = groups.length;
      const newHasMore = pagination.total > groups.length;

      setGroupsTotal(pagination.total);
      setGroupsOffset(newOffset);
      setHasMoreGroups(newHasMore);
      setRawGroups(groups);

      return response;
    },
    {
      manual: true,
      onError: (err) => {
        toast.error("Failed to load groups", {
          description: err.message || "An error occurred while loading groups",
        });
      },
    }
  );

  // Load more groups function
  const loadMoreGroups = useCallback(async () => {
    if (groupsLoading || loadingMoreGroups || !hasMoreGroups || groupsOffset === 0)
      return;

    setLoadingMoreGroups(true);
    try {
      const response = await listGroups({
        projectId: projectIdRef.current,
        params: {
          groupBy: groupByRef.current,
          ...(threadIdRef.current ? { threadIds: threadIdRef.current } : {}),
          ...(groupByRef.current === 'time' ? { bucketSize: bucketSizeRef.current } : {}),
          limit: LIMIT_LOADING_GROUPS,
          offset: groupsOffset,
        },
      });

      const groups = response?.data || [];
      const pagination = response?.pagination || {
        offset: 0,
        limit: 0,
        total: 0,
      };

      // Update pagination state
      const newOffset = groupsOffset + groups.length;
      const newHasMore = pagination.total > newOffset;

      setGroupsTotal(pagination.total);
      setGroupsOffset(newOffset);
      setHasMoreGroups(newHasMore);
      setRawGroups((prev) => [...prev, ...groups]);
    } catch (err: any) {
      toast.error("Failed to load more groups", {
        description: err.message || "An error occurred while loading more groups",
      });
    } finally {
      setLoadingMoreGroups(false);
    }
  }, [
    groupsLoading,
    loadingMoreGroups,
    hasMoreGroups,
    groupsOffset,
    threadIdRef,
    projectIdRef,
    bucketSizeRef,
    groupByRef,
  ]);

  // Refresh groups function (reset and reload from beginning)
  const refreshGroups = useCallback(() => {
    setGroupsOffset(0);
    setGroupsTotal(0);
    setHasMoreGroups(false);
    setRawGroups([]);
    triggerRefreshGroups();
  }, [triggerRefreshGroups]);

  return {
    groups: rawGroups,
    setGroups: setRawGroups,
    groupsLoading,
    groupsError,
    refreshGroups,
    loadMoreGroups,
    hasMoreGroups,
    groupsTotal,
    loadingMoreGroups,
    hideGroups,
    setHideGroups,
    // openGroups,
    // setOpenGroups,
  };
}
