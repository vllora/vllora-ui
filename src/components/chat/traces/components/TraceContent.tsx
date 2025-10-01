import React from "react";
import { TraceLoadingState } from "./TraceLoadingState";
import { TraceEmptyState } from "./TraceEmptyState";
import { TraceList } from "./TraceList";
import { cn } from "@/lib/utils";
import { RunDTO } from "@/services/runs-api";

interface TraceContentProps {
  loadingSpans: boolean;
  runs: RunDTO[];
  hasMore: boolean;
  loadMoreRuns: () => Promise<void>;
  loadingMore: boolean;
  threadId: string;
  observerTarget: React.RefObject<HTMLDivElement | null>;
}

const TraceContentImpl: React.FC<TraceContentProps> = ({
  loadingSpans,
  runs,
  hasMore,
  loadMoreRuns,
  loadingMore,
  observerTarget,
}) => {
  if (loadingSpans && (!runs || runs.length === 0)) {
    return <TraceLoadingState />;
  }

  if (!loadingSpans && (!runs || runs.length === 0)) {
    return <TraceEmptyState />;
  }

  return (
    <div className={cn("h-full flex flex-col")}>
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
        <TraceList
          runs={runs}
          hasMore={hasMore}
          loadMoreRuns={loadMoreRuns}
          loadingMore={loadingMore}
          observerTarget={observerTarget}
        />
      </div>
    </div>
  );
};

export const TraceContent = TraceContentImpl;
