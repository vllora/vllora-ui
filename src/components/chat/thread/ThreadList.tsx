import React, { useEffect, useRef } from 'react';
import { InfoIcon, CheckCircle2, Loader2 } from 'lucide-react';
import { Thread } from '@/types/chat';
import { ThreadsConsumer } from '@/contexts/ThreadsContext';
import { ThreadRow } from './ThreadRow';
import { useVirtualizer } from '@tanstack/react-virtual';

interface ThreadListProps {
  threads: Thread[];
}

export const ThreadList: React.FC<ThreadListProps> = ({
  threads,
}) => {
  const { loading, loadingMore, loadingThreadsError, loadMoreThreads, hasMore } = ThreadsConsumer();
  const loadingRef = useRef(false);
  const parentRef = useRef<HTMLDivElement>(null);
  const [timeUpdateTrigger, setTimeUpdateTrigger] = React.useState(0);

  useEffect(() => {
    loadingRef.current = loading || loadingMore;
  }, [loading, loadingMore]);

  // Global interval for updating all visible thread times
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeUpdateTrigger(prev => prev + 1);
    }, 60000); // Update every 60 seconds

    return () => clearInterval(interval);
  }, []);

  // Virtualize the list
  const rowVirtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120, // Estimated height of each thread row
    overscan: 5, // Render 5 extra items above and below viewport
  });

  // Load more when scrolling near the end
  useEffect(() => {
    const [lastItem] = [...rowVirtualizer.getVirtualItems()].reverse();

    if (!lastItem) return;

    if (
      lastItem.index >= threads.length - 1 &&
      hasMore &&
      !loadingRef.current
    ) {
      loadMoreThreads();
    }
  }, [
    hasMore,
    loadMoreThreads,
    threads.length,
    rowVirtualizer.getVirtualItems(),
  ]);

  return (
    <>
      {threads && threads.length > 0 && (
        <div
          ref={parentRef}
          className="h-full overflow-y-auto"
          style={{ contain: 'strict' }}
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize() + 80}px`,
              width: '100%',
              position: 'relative',
              paddingTop: '8px',
              paddingBottom: '8px',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const thread = threads[virtualRow.index];
              return (
                <div
                  key={thread.id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${virtualRow.start + 8}px)`,
                    paddingLeft: '8px',
                    paddingRight: '8px',
                    paddingBottom: '8px',
                  }}
                >
                  <ThreadRow thread={thread} timeUpdateTrigger={timeUpdateTrigger} />
                </div>
              );
            })}

            {/* Load More Indicator - absolutely positioned at bottom */}
            {hasMore && (
              <div
                className="h-16 w-full flex items-center justify-center"
                style={{
                  position: 'absolute',
                  top: `${rowVirtualizer.getTotalSize() + 8}px`,
                  left: 0,
                  right: 0,
                }}
              >
                {loadingMore ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">Loading...</span>
                  </div>
                ) : (
                  <div className="h-1 w-12 rounded-full bg-muted animate-pulse"></div>
                )}
              </div>
            )}

            {/* All loaded indicator - absolutely positioned at bottom */}
            {!hasMore && (
              <div
                className="h-16 w-full flex items-center justify-center"
                style={{
                  position: 'absolute',
                  top: `${rowVirtualizer.getTotalSize() + 8}px`,
                  left: 0,
                  right: 0,
                }}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[rgb(var(--theme-500))]" />
                  <span className="text-sm font-medium text-muted-foreground">All threads loaded</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {loading && threads.length === 0 && (
        <div className="p-8 flex-1 w-full flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {loadingThreadsError && (
        <div className="p-8 flex-1 w-full flex flex-col items-center">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-destructive/20 p-4">
              <InfoIcon className="w-8 h-8 text-destructive" />
            </div>
            <p className="text-sm text-muted-foreground">{loadingThreadsError}</p>
          </div>
        </div>
      )}

      {!loading && (!threads || threads.length === 0) && (
        <div className="p-8 flex-1 w-full flex flex-col items-center">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-muted/20 p-4">
              <InfoIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-center flex flex-col items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground mb-1">No Threads Found</h3>
              <p className="text-sm text-muted-foreground max-w-[300px]">
                Start a new conversation to see your threads appear here.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
