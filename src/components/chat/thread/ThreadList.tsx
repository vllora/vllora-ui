import React, { useEffect, useRef, useCallback } from 'react';
import { InfoIcon, CheckCircle2, Loader2 } from 'lucide-react';
import { Thread } from '@/types/chat';
import { ThreadsConsumer } from '@/contexts/ThreadsContext';
import { ThreadRow } from './ThreadRow';

interface ThreadListProps {
  threads: Thread[];
  onThreadTitleChange?: (threadId: string, title: string) => void;
}

export const ThreadList: React.FC<ThreadListProps> = ({
  threads,
  onThreadTitleChange,
}) => {
  const { loading, loadingMore, loadingThreadsError, loadMoreThreads, hasMore } = ThreadsConsumer();
  const observerTarget = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    loadingRef.current = loading || loadingMore;
  }, [loading, loadingMore]);

  const intersectionCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const first = entries[0];
      if (first.isIntersecting && hasMore && !loadingRef.current) {
        loadMoreThreads();
      }
    },
    [hasMore, loadMoreThreads]
  );

  useEffect(() => {
    const observer = new IntersectionObserver(intersectionCallback, {
      threshold: 0.1,
      rootMargin: '100px',
    });

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [intersectionCallback]);

  return (
    <>
      {threads && threads.length > 0 && (
        <div className="p-2 space-y-2">
          {threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              onThreadTitleChange={onThreadTitleChange}
            />
          ))}
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

      {/* Load More Indicator */}
      {hasMore && threads.length > 0 && (
        <div
          ref={observerTarget}
          className="h-16 w-full flex items-center justify-center py-2"
        >
          {loadingMore ? (
            <div className="flex items-center gap-2 px-4 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Loading...</span>
            </div>
          ) : (
            <div className="h-1 w-12 rounded-full bg-muted animate-pulse"></div>
          )}
        </div>
      )}

      {!hasMore && threads.length > 0 && (
        <div className="h-16 w-full flex items-center justify-center py-2">
          <div className="flex items-center gap-2 px-4 py-2">
            <CheckCircle2 size={16} className="text-[rgb(var(--theme-500))]" />
            <span className="text-sm font-medium text-muted-foreground">All threads loaded</span>
          </div>
        </div>
      )}
    </>
  );
};
