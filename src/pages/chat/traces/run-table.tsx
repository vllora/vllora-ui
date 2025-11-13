import { useRef } from 'react';
import { TracesPageConsumer } from '@/contexts/TracesPageContext';
import { GroupCardGrid } from './group-card/grid';
import { TraceEmptyState } from '@/components/chat/traces/components/TraceEmptyState';
import { GroupsSkeletonLoader } from '@/components/GroupsSkeletonLoader';

export function RunTable() {
  const {
    projectId,
    groups,
    groupsLoading,
    groupsError,
    refreshGroups,
    loadMoreGroups,
    hasMoreGroups,
    loadingMoreGroups,
    groupsTotal,
    goToPage,
    goToPreviousPage,
    currentPage,
  } = TracesPageConsumer();

  const currentPageValue = currentPage || 1;

  const observerTarget = useRef<HTMLDivElement>(null);
  // Loading state
  if (groupsLoading && groups.length === 0) {
    return <GroupsSkeletonLoader />;
  }

  // Error state
  if (groupsError && groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="flex flex-col items-center gap-3 max-w-md text-center">
          <p className="text-sm text-red-400">Failed to load groups</p>
          <p className="text-xs text-muted-foreground">{groupsError.message}</p>
          <button
            onClick={refreshGroups}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (!groupsLoading && groups.length === 0) {
    return <TraceEmptyState projectId={projectId} />;
  }

  // Groups list (unified for all modes: run, bucket, thread)
  return (
    <div className="flex-1 w-full h-full overflow-auto">
      <GroupCardGrid
        groups={groups}
        totalGroups={groupsTotal}
        currentPage={currentPageValue}
        hasMore={hasMoreGroups}
        loadingMore={loadingMoreGroups}
        onLoadMore={loadMoreGroups}
        onGoToPage={goToPage}
        onGoToPreviousPage={goToPreviousPage}
        observerRef={observerTarget}
      />
    </div>
  );
}
