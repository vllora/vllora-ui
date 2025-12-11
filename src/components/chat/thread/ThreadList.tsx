import React, { useEffect, useRef } from 'react';
import { InfoIcon, Loader2 } from 'lucide-react';
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
  const parentRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);

  // Virtualize the list
  const rowVirtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 86, // Estimated height of each thread row
    overscan: 5, // Render 5 extra items above and below viewport
    measureElement: (element) => {
      const height = element?.getBoundingClientRect().height ?? 86;
      return height;
    },
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastItemIndex = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1]?.index : -1;

  // Reset ref when loadingMore state changes to false
  useEffect(() => {
    if (!loadingMore) {
      isLoadingMoreRef.current = false;
    }
  }, [loadingMore]);

  // Load more when scrolling near the end
  useEffect(() => {
    if (
      lastItemIndex >= threads.length - 1 &&
      hasMore &&
      !loading &&
      !loadingMore &&
      !isLoadingMoreRef.current
    ) {
      // Set ref synchronously before calling loadMoreThreads
      isLoadingMoreRef.current = true;
      loadMoreThreads();
    }
  }, [
    lastItemIndex,
    hasMore,
    loading,
    loadingMore,
    loadMoreThreads,
    threads.length,
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
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const thread = threads[virtualRow.index];
              
              if (!thread?.thread_id) {
                return null;
              }
              
              return (
                <div
                  key={thread.thread_id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: `${virtualRow.start}px`,
                    left: 0,
                    width: '100%',
                    padding: '4px 8px',
                  }}
                >
                  <ThreadRow thread={thread}/>
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
