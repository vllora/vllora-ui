"use client";

import React, { useRef } from "react";
import { TraceContent } from "./TraceContent";
import { cn } from "@/lib/utils";
import { RunDTO } from "@/services/runs-api";

interface TraceMainContentProps {
  loadingSpans: boolean;
  runs: RunDTO[];
  hasMore: boolean;
  loadMoreRuns: () => Promise<void>;
  loadingMore: boolean;
  threadId: string;
}

// Component implementation
const TraceMainContentImpl: React.FC<TraceMainContentProps> = ({
  loadingSpans,
  runs,
  hasMore,
  loadMoreRuns,
  loadingMore,
  threadId,
}) => {
  const observerTarget = useRef<HTMLDivElement>(null);

  return (
    <div className={cn("h-full flex flex-col overflow-hidden")}>
      <div className="h-full flex flex-col min-w-0">
        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 bg-black p-2">
          <TraceContent
            loadingSpans={loadingSpans}
            runs={runs}
            hasMore={hasMore}
            loadMoreRuns={loadMoreRuns}
            loadingMore={loadingMore}
            threadId={threadId}
            observerTarget={observerTarget}
          />
        </div>
      </div>
    </div>
  );
};

// Custom comparison function to prevent unnecessary re-renders
const arePropsEqual = (
  prevProps: TraceMainContentProps,
  nextProps: TraceMainContentProps
) => {
  // Check primitive props first (fastest)
  if (
    prevProps.loadingSpans !== nextProps.loadingSpans ||
    prevProps.hasMore !== nextProps.hasMore ||
    prevProps.loadingMore !== nextProps.loadingMore ||
    prevProps.threadId !== nextProps.threadId
  ) {
    return false;
  }

  // Efficiently compare runs arrays
  const prevRuns = prevProps.runs;
  const nextRuns = nextProps.runs;
  if (prevRuns === nextRuns) return true; // Same reference
  if (!prevRuns || !nextRuns) return prevRuns === nextRuns;
  if (prevRuns.length !== nextRuns.length) return false;
  for (let i = 0; i < prevRuns.length; i++) {
    if (prevRuns[i].run_id !== nextRuns[i].run_id) return false;
  }

  return true;
};

// Export memoized component
export const TraceMainContent = React.memo(TraceMainContentImpl, arePropsEqual);
