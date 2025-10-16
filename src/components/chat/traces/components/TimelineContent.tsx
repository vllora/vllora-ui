import React from "react";
import { SingleRunTimelineView } from "../TraceRow/new-timeline/single-run-timeline";
import { cn } from "@/lib/utils";
import { Span } from "@/types/common-type";
import { RunDetailConsumer, RunDetailProvider } from "@/contexts/RunDetailContext";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";

interface TimelineContentProps {
  spansByRunId: Span[];
}

export const TimelineContent: React.FC<TimelineContentProps> = ({
  spansByRunId,
}) => {

  // Determine if in sidebar or main view
  const isInSidebar = true;

  // Get run ID from first span (all spans should belong to same run)
  const runId = spansByRunId && spansByRunId.length > 0 ? spansByRunId[0]?.run_id : '';
  const { projectId } = ChatWindowConsumer()// Temporary: get from run data
  return (
    <RunDetailProvider runId={runId} projectId={projectId} spansByRunId={spansByRunId}>
      <div className={cn("flex flex-col h-full overflow-hidden")}>
        {/* Timeline Content */}
        <div
          className={cn(
            "flex-1 overflow-auto mt-2",
            isInSidebar ? "bg-[#0f0f0f]" : "bg-[#0f0f0f] px-2"
          )}
        >
          <TimelineContentInner />
        </div>
      </div>
    </RunDetailProvider>
  );
};
const TimelineContentInner = () => {
  const { hierarchies, runId } = RunDetailConsumer()
  const {  selectedSpanId, setSelectedSpanId, setSelectedRunId, setDetailSpanId } = ChatWindowConsumer()// Temporary: get from run data

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
        isInSidebar={true}
        selectedSpanId={selectedSpanId || undefined}
        level={0}
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
