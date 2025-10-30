import { useState, useCallback } from "react";
import { useRequest, useLatest } from "ahooks";
import { toast } from "sonner";
import { listGroups, GroupDTO } from "@/services/groups-api";

const LIMIT_LOADING_GROUPS = 20;

interface UseGroupsPaginationParams {
  projectId: string;
  bucketSize: number; // In seconds (e.g., 3600 for 1 hour)
  threadId?: string; // Optional - for filtering by thread
  onGroupsLoaded?: (groups: GroupDTO[]) => void;
}

export function useGroupsPagination({
  projectId,
  bucketSize,
  threadId,
  onGroupsLoaded,
}: UseGroupsPaginationParams) {
  // Pagination state for groups
  const [groupsOffset, setGroupsOffset] = useState<number>(0);
  const [groupsTotal, setGroupsTotal] = useState<number>(0);
  const [hasMoreGroups, setHasMoreGroups] = useState<boolean>(false);
  const [loadingMoreGroups, setLoadingMoreGroups] = useState<boolean>(false);
  const [rawGroups, setRawGroups] = useState<GroupDTO[]>([]);
  // const [openGroups, setOpenGroups] = useState<
  //   { time_bucket: number; tab: "trace" | "code" }[]
  // >([]);
  const [hideGroups, setHideGroups] = useState<
     { time_bucket: number; tab: "trace" | "code" }[]
  >([]);
  const projectIdRef = useLatest(projectId);
  const threadIdRef = useLatest(threadId);
  const bucketSizeRef = useLatest(bucketSize);

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
          ...(threadId ? { threadIds: threadId } : {}),
          bucketSize,
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
          ...(threadIdRef.current ? { threadIds: threadIdRef.current } : {}),
          bucketSize: bucketSizeRef.current,
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
