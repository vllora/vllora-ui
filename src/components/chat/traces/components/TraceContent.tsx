import React from "react";
import { TraceLoadingState } from "./TraceLoadingState";
import { TraceEmptyState } from "./TraceEmptyState";
import { TraceList } from "./TraceList";
import { SidebarExpandedRun } from "./SidebarExpandedRun";
import { cn } from "@/lib/utils";
import { RunDTO } from "@/services/runs-api";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";

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
  const { openTraces } = ChatWindowConsumer();

  if (loadingSpans && (!runs || runs.length === 0)) {
    return <TraceLoadingState />;
  }

  if (!loadingSpans && (!runs || runs.length === 0)) {
    return <TraceEmptyState />;
  }

  // Show expanded single run view when exactly one trace is open
  const isShowingExpandedRun =  openTraces && openTraces.length > 0;

  return (
    <div className={cn("h-full flex flex-col")}>
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
        {isShowingExpandedRun ? (
          <SidebarExpandedRun  />
        ) : (
          <TraceList
            runs={runs}
            hasMore={hasMore}
            loadMoreRuns={loadMoreRuns}
            loadingMore={loadingMore}
            observerTarget={observerTarget}
          />
        )}
      </div>
    </div>
  );
};

export const TraceContent = TraceContentImpl;
