import React, { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { RunDTO } from '@/services/runs-api';
import { TraceRow } from './TraceRow';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';

interface TraceListProps {
  runs: RunDTO[];
  hasMore: boolean;
  loadMoreRuns: () => Promise<void>;
  loadingMore: boolean;
  observerTarget: React.RefObject<HTMLDivElement | null>;
}

export const TraceList: React.FC<TraceListProps> = ({
  runs,
  hasMore,
  loadMoreRuns,
  loadingMore,
}) => {
  const { hoverSpanId, runHighlighted } = ChatWindowConsumer();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hoverSpanId) return;

    // Find the element with the hovered span ID
    const spanElement = document.querySelector(`[data-span-id="${hoverSpanId}"]`);
    if (!spanElement) return;

    // Check if element is in viewport
    const rect = spanElement.getBoundingClientRect();
    const isInViewport = (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );

    // If not in viewport, scroll to it
    if (!isInViewport) {
      spanElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }, [hoverSpanId]);

  useEffect(() => {
    if (!runHighlighted) return;

    // Find the element with the highlighted run ID
    const runElement = document.querySelector(`[data-run-or-trace-id="${runHighlighted}"]`);
    if (!runElement) return;

    // Check if element is in viewport
    const rect = runElement.getBoundingClientRect();
    const isInViewport = (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );

    // If not in viewport, scroll to it
    if (!isInViewport) {
      runElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }, [runHighlighted]);

  return (
    <div ref={containerRef} className="space-y-2">
      {runs.map((run) => (
        <TraceRow key={`run-${run.run_id}`} run={run} isInSidebar={true} />
      ))}

      {/* Load More Button */}
      {hasMore && (
        <button
          onClick={loadMoreRuns}
          disabled={loadingMore}
          className="w-full p-3 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent/50 transition-colors disabled:opacity-50"
        >
          {loadingMore ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading more...
            </span>
          ) : (
            'Load More'
          )}
        </button>
      )}
    </div>
  );
};
