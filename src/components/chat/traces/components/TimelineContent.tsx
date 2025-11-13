import React, { memo } from "react";
import { SingleRunTimelineView } from "../TraceRow/new-timeline/single-run-timeline";
import { cn } from "@/lib/utils";
import { Span } from "@/types/common-type";
import { RunDetailConsumer, RunDetailProvider } from "@/contexts/RunDetailContext";

interface TimelineContentProps {
  spansByRunId: Span[];
  projectId: string;
  selectedSpanId: string | null;
  setSelectedSpanId: (spanId: string | null) => void;
  setSelectedRunId: (runId: string | null) => void;
  setDetailSpanId: (spanId: string | null) => void;
  isInSidebar?: boolean;
  hoverSpanId?: string;
  collapsedSpans: string[];

  onToggle?: (spanId: string) => void;
}

export const TimelineContent: React.FC<TimelineContentProps> = memo(({
  spansByRunId,
  projectId,
  selectedSpanId,
  setSelectedSpanId,
  setSelectedRunId,
  setDetailSpanId,
  isInSidebar = true,
  hoverSpanId,
  collapsedSpans,
  onToggle
}) => {

  // For grouped views (like time buckets), spans can belong to multiple runs
  // Extract unique run IDs and use a composite identifier for multi-run scenarios
  const uniqueRunIds = spansByRunId && spansByRunId.length > 0
    ? [...new Set(spansByRunId.map(s => s.run_id).filter(Boolean))]
    : [];

  // Use a composite runId for multi-run scenarios (e.g., time bucket grouping)
  const runId = uniqueRunIds.length === 1
    ? uniqueRunIds[0] || 'unknown'
    : `multi-run-${uniqueRunIds.length}`;

  return (
    <RunDetailProvider runId={runId} projectId={projectId} spansByRunId={spansByRunId}>
      <div className={cn("flex flex-col h-full overflow-hidden")}>
        {/* Timeline Content */}
        <div
          className={cn(
            "flex-1 overflow-auto mt-2",
          )}
        >
          <TimelineContentInner
            selectedSpanId={selectedSpanId}
            setSelectedSpanId={setSelectedSpanId}
            setSelectedRunId={setSelectedRunId}
            setDetailSpanId={setDetailSpanId}
            isInSidebar={isInSidebar}
            hoverSpanId={hoverSpanId}
            collapsedSpans={collapsedSpans}
            onToggle={onToggle}
          />
        </div>
      </div>
    </RunDetailProvider>
  );
});

TimelineContent.displayName = 'TimelineContent';

const TimelineContentInner = memo((props: {
  selectedSpanId: string | null;
  setSelectedSpanId: (spanId: string | null) => void;
  setSelectedRunId: (runId: string | null) => void;
  setDetailSpanId: (spanId: string | null) => void;
  isInSidebar?: boolean;
  hoverSpanId?: string;
  collapsedSpans: string[];
  onToggle?: (spanId: string) => void;
}) => {
  const { hierarchies, runId } = RunDetailConsumer()
  const { selectedSpanId, setSelectedSpanId, setSelectedRunId, setDetailSpanId, isInSidebar = true, hoverSpanId, collapsedSpans, onToggle } = props

  if (!hierarchies || hierarchies.length === 0) {
    return <div className="flex items-center justify-center p-4 text-sm text-gray-400">
      No spans available for this run
    </div>
  }

  console.log('===== hierarchies', hierarchies);
  return <div className="flex flex-col gap-0 divide-y divide-border/50 border-b border-border/50">
    {hierarchies.map((hierarchy, index) => (
      <SingleRunTimelineView
        key={`${runId}-${hierarchy.span_id}`}
        currentSpanHierarchy={hierarchy}
        index={index}
        isInSidebar={isInSidebar}
        selectedSpanId={selectedSpanId || undefined}
        level={0}
        hoverSpanId={hoverSpanId}
        collapsedSpans={collapsedSpans}
        onToggle={onToggle}
        onSpanSelect={(spanId, runId) => {
          if (runId) {
            setSelectedSpanId(spanId);
            setSelectedRunId(runId);
            setDetailSpanId(spanId);
          }
        }}
      />
    ))}
  </div>
});

TimelineContentInner.displayName = 'TimelineContentInner';
