"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { TraceContent } from "./TraceContent";
import { SpanDetailsPanel } from "./SpanDetailsPanel";
import { RunDTO } from "@/services/runs-api";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ImperativePanelGroupHandle } from "react-resizable-panels";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";

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

  // Get selectedSpanInfo from context to ensure consistency
  const { openTraces } = ChatWindowConsumer();

  // Memoize panel sizes to prevent unnecessary re-calculations
  const { defaultSizes, minSizes } = useMemo(() => {
    const hasSelectedSpan = Boolean(openTraces?.length);
    const defaultSizes: [number, number] = hasSelectedSpan ? [40, 60] : [100, 0];
    const minSizes: [number, number] = hasSelectedSpan ? [20, 30] : [100, 0];

    return { defaultSizes, minSizes };
  }, [openTraces]);

  const panelGroupRef = useRef<ImperativePanelGroupHandle>(null);

  // Effect to handle panel layout changes - debounced to prevent rapid updates
  useEffect(() => {
    const timer = setTimeout(() => {
      if (panelGroupRef.current && panelGroupRef.current.setLayout) {
        panelGroupRef.current.setLayout(defaultSizes);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [defaultSizes]);

  return (
    <ResizablePanelGroup
      direction="vertical"
      id="traces-panel-group"
      className="bg-black"
      ref={panelGroupRef}
    >
      <ResizablePanel
        defaultSize={defaultSizes[0]}
        minSize={minSizes[0]}
        id="trace-content"
        className="overflow-hidden"
      >
        <div className="h-full w-full">
          <div className="h-full overflow-y-auto overflow-x-hidden p-2">
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
      </ResizablePanel>
      <ResizableHandle
        withHandle={false}
        className="hover:bg-secondary transition-colors"
      />
      <ResizablePanel
        defaultSize={defaultSizes[1]}
        minSize={minSizes[1]}
        id="span-details"
      >
        <SpanDetailsPanel className="border-l border-border bg-black" />
      </ResizablePanel>
    </ResizablePanelGroup>
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
