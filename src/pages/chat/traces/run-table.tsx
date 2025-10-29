import { useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { TracesPageConsumer } from '@/contexts/TracesPageContext';
import { RunTableView } from './run-table-view';
import { GroupCardGrid } from './group-card-grid';
import { TraceEmptyState } from '@/components/chat/traces/components/TraceEmptyState';

export function RunTable() {
  const {
    projectId,
    groupByMode,
    runs,
    runsLoading,
    runsError,
    refreshRuns,
    loadMoreRuns,
    hasMoreRuns,
    loadingMoreRuns,
    groups,
    groupsLoading,
    groupsError,
    refreshGroups,
    loadMoreGroups,
    hasMoreGroups,
    loadingMoreGroups,
  } = TracesPageConsumer();

  const observerTarget = useRef<HTMLDivElement>(null);

  const isLoading = groupByMode === 'run' ? runsLoading : groupsLoading;
  const error = groupByMode === 'run' ? runsError : groupsError;
  const items = groupByMode === 'run' ? runs : groups;
  const hasMore = groupByMode === 'run' ? hasMoreRuns : hasMoreGroups;
  const loadingMore = groupByMode === 'run' ? loadingMoreRuns : loadingMoreGroups;
  const loadMore = groupByMode === 'run' ? loadMoreRuns : loadMoreGroups;
  const refresh = groupByMode === 'run' ? refreshRuns : refreshGroups;

  // Loading state
  if (isLoading && items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {groupByMode === 'run' ? 'Loading traces...' : 'Loading groups...'}
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="flex flex-col items-center gap-3 max-w-md text-center">
          <p className="text-sm text-red-400">
            {groupByMode === 'run' ? 'Failed to load traces' : 'Failed to load groups'}
          </p>
          <p className="text-xs text-muted-foreground">{error.message}</p>
          <button
            onClick={refresh}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (!isLoading && items.length === 0) {
    return <TraceEmptyState projectId={projectId} />;
  }

  // Runs/Groups list
  return (
    <div className="flex-1 w-full h-full overflow-auto">
      {groupByMode === 'run' ? (
        <RunTableView
          runs={runs}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          observerRef={observerTarget}
        />
      ) : (
        <GroupCardGrid
          groups={groups}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          observerRef={observerTarget}
        />
      )}
    </div>
  );
}
