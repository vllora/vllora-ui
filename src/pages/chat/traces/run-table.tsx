import { useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { TracesPageConsumer } from '@/contexts/TracesPageContext';
import { GroupCardGrid } from './group-card/grid';
import { TraceEmptyState } from '@/components/chat/traces/components/TraceEmptyState';

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
  } = TracesPageConsumer();

  const observerTarget = useRef<HTMLDivElement>(null);

  // Loading state
  if (groupsLoading && groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading groups...</p>
        </div>
      </div>
    );
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
        hasMore={hasMoreGroups}
        loadingMore={loadingMoreGroups}
        onLoadMore={loadMoreGroups}
        observerRef={observerTarget}
      />
    </div>
  );
}
