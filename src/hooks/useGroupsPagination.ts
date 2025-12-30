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
  labels?: string[]; // Optional - for filtering by labels (attribute.label)
  onGroupsLoaded?: (groups: GenericGroupDTO[]) => void;
  initialPage?: number; // Optional initial page from URL
}

export function useGroupsPagination({
  projectId,
  bucketSize,
  groupBy = 'time',
  threadId,
  labels,
  onGroupsLoaded,
  initialPage = 1,
}: UseGroupsPaginationParams) {
  // Pagination state for groups
  const [groupsOffset, setGroupsOffset] = useState<number>(0);
  const [groupsTotal, setGroupsTotal] = useState<number>(0);
  const [hasMoreGroups, setHasMoreGroups] = useState<boolean>(false);
  const [loadingMoreGroups, setLoadingMoreGroups] = useState<boolean>(false);
  const [rawGroups, setRawGroups] = useState<GenericGroupDTO[]>([]);
  const [hideGroups, setHideGroups] = useState<HideGroupKey[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const projectIdRef = useLatest(projectId);
  const threadIdRef = useLatest(threadId);
  const bucketSizeRef = useLatest(bucketSize);
  const groupByRef = useLatest(groupBy);
  const labelsRef = useLatest(labels);

  // Use ahooks useRequest for fetching groups (initial load)
  const {
    loading: groupsLoading,
    error: groupsError,
    run: triggerRefreshGroups,
  } = useRequest(
    async () => {
      // Use refs to get latest values when called
      const currentProjectId = projectIdRef.current;
      const currentGroupBy = groupByRef.current;
      const currentThreadId = threadIdRef.current;
      const currentBucketSize = bucketSizeRef.current;
      const currentLabels = labelsRef.current;

      if (!currentProjectId) {
        return { data: [], pagination: { offset: 0, limit: 0, total: 0 } };
      }
      const response = await listGroups({
        projectId: currentProjectId,
        params: {
          group_by: currentGroupBy,
          ...(currentThreadId ? { thread_ids: currentThreadId } : {}),
          ...(currentGroupBy === 'time' ? { bucket_size: currentBucketSize } : {}),
          ...(currentLabels && currentLabels.length > 0 ? { labels: currentLabels.join(',') } : {}),
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
      setCurrentPage(1);

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
          group_by: groupByRef.current,
          ...(threadIdRef.current ? { thread_ids: threadIdRef.current } : {}),
          ...(groupByRef.current === 'time' ? { bucket_size: bucketSizeRef.current } : {}),
          ...(labelsRef.current && labelsRef.current.length > 0 ? { labels: labelsRef.current.join(',') } : {}),
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
    labelsRef,
  ]);

  // Refresh groups function (reset and reload from beginning)
  const refreshGroups = useCallback(() => {
    setGroupsOffset(0);
    setGroupsTotal(0);
    setHasMoreGroups(false);
    setRawGroups([]);
    triggerRefreshGroups();
  }, [triggerRefreshGroups]);

  // Go to a specific page (loads only that specific page)
  const goToPage = useCallback(async (pageNumber: number) => {
    if (groupsLoading || loadingMoreGroups || pageNumber < 1) return;

    const targetOffset = (pageNumber - 1) * LIMIT_LOADING_GROUPS;

    // If going to page 1, use refresh
    if (targetOffset === 0) {
      refreshGroups();
      return;
    }

    setLoadingMoreGroups(true);
    try {
      // Fetch only the specific page
      const response = await listGroups({
        projectId: projectIdRef.current,
        params: {
          group_by: groupByRef.current,
          ...(threadIdRef.current ? { thread_ids: threadIdRef.current } : {}),
          ...(groupByRef.current === 'time' ? { bucket_size: bucketSizeRef.current } : {}),
          ...(labelsRef.current && labelsRef.current.length > 0 ? { labels: labelsRef.current.join(',') } : {}),
          limit: LIMIT_LOADING_GROUPS,
          offset: targetOffset,
        },
      });

      const groups = response?.data || [];
      const pagination = response?.pagination || {
        offset: 0,
        limit: 0,
        total: 0,
      };

      // Call onGroupsLoaded for the loaded groups
      onGroupsLoaded?.(groups);

      // Update pagination state
      const newOffset = targetOffset + groups.length;
      const newHasMore = pagination.total > newOffset;

      setGroupsTotal(pagination.total);
      setGroupsOffset(newOffset);
      setHasMoreGroups(newHasMore);
      setRawGroups(groups);
      setCurrentPage(pageNumber);
    } catch (err: any) {
      toast.error("Failed to go to page", {
        description: err.message || "An error occurred while navigating to page",
      });
    } finally {
      setLoadingMoreGroups(false);
    }
  }, [
    groupsLoading,
    loadingMoreGroups,
    projectIdRef,
    groupByRef,
    threadIdRef,
    bucketSizeRef,
    labelsRef,
    refreshGroups,
    onGroupsLoaded,
  ]);

  // Go to previous page
  const goToPreviousPage = useCallback(() => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  }, [currentPage, goToPage]);

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
    goToPage,
    goToPreviousPage,
    currentPage,
    // openGroups,
    // setOpenGroups,
  };
}
