"use client";

import React, { useRef } from "react";
import { TraceContent } from "./TraceContent";
import { RunDTO } from "@/services/runs-api";

interface TraceMainContentProps {
  loadingSpans: boolean;
  runs: RunDTO[];
  hasMore: boolean;
  loadMoreRuns: () => Promise<void>;
  loadingMore: boolean;
  threadId: string;
  openTraces: {
    run_id: string;
    tab: "trace" | "code";
  }[];
}

// Component implementation
const TraceMainContentImpl: React.FC<TraceMainContentProps> = ({
  loadingSpans,
  runs,
  hasMore,
  loadMoreRuns,
  loadingMore,
  threadId,
  openTraces,
}) => {
  const observerTarget = useRef<HTMLDivElement>(null);

  return (
    <div className="h-full w-full bg-black">
      {/* Main Trace Content */}
      <div className="h-full overflow-y-auto overflow-x-hidden p-2">
        <TraceContent
          loadingSpans={loadingSpans}
          runs={runs}
          hasMore={hasMore}
          loadMoreRuns={loadMoreRuns}
          loadingMore={loadingMore}
          threadId={threadId}
          observerTarget={observerTarget}
          openTraces={openTraces}
        />
      </div>
    </div>
  );
};


// Export memoized component
export const TraceMainContent = TraceMainContentImpl;
