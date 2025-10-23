import React from "react";
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

export const TimelineContent: React.FC<TimelineContentProps> = ({
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

  // Get run ID from first span (all spans should belong to same run)
  const runId = spansByRunId && spansByRunId.length > 0 ? spansByRunId[0]?.run_id : '';
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
};
const TimelineContentInner = (props: {
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
  return <>
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
  </>
}
