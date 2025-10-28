import { useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { TracesPageConsumer } from '@/contexts/TracesPageContext';
import { RunTableRow } from './run-table-row';
import { RunTableHeader } from './run-table-header';
import { GroupTableRow } from './group-table-row';

export function RunTable() {
  const {
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
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {groupByMode === 'run' ? 'No traces found' : 'No groups found'}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {groupByMode === 'run'
              ? 'Traces will appear here as your application runs'
              : 'Groups will appear here as traces are created'}
          </p>
        </div>
      </div>
    );
  }

  // Runs/Groups list
  return (
    <div className="flex-1 w-full h-full overflow-auto">
      <div className="px-2">
        {/* Table Header - Sticky */}
        <div className="sticky top-0 z-10">
          <RunTableHeader />
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-border">
          {groupByMode === 'run'
            ? runs.map((run, index) => (
                <RunTableRow key={run.run_id} run={run} index={index} />
              ))
            : groups.map((group, index) => (
                <GroupTableRow key={group.time_bucket} group={group} index={index} />
              ))}

          {/* Load More Button */}
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full p-4 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingMore ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {groupByMode === 'run' ? 'Loading more traces...' : 'Loading more groups...'}
                </span>
              ) : (
                `Load More (${items.length} loaded)`
              )}
            </button>
          )}

          {/* Observer target for infinite scroll (optional future enhancement) */}
          <div ref={observerTarget} className="h-4" />
        </div>
      </div>
    </div>
  );
}
