import React from "react";
import { SingleRunTimelineView } from "../TraceRow/new-timeline/single-run-timeline";
import { cn } from "@/lib/utils";
import { Span } from "@/types/common-type";
import { RunDetailProvider } from "@/contexts/RunDetailContext";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";

interface TimelineContentProps {
  rootSpans: Span[];
}

export const TimelineContent: React.FC<TimelineContentProps> = ({
  rootSpans,
}) => {

  // Determine if in sidebar or main view
  const isInSidebar = true;

  // Get run ID from first span (all spans should belong to same run)
  const runId = rootSpans &&rootSpans.length > 0 ? rootSpans[0]?.run_id : '';
  const {projectId} =  ChatWindowConsumer()// Temporary: get from run data

  return (
    <RunDetailProvider runId={runId} projectId={projectId} spans={rootSpans}>
      <div className={cn("flex flex-col h-full overflow-hidden")}>
        {/* Timeline Content */}
        <div
          className={cn(
            "flex-1 overflow-auto mt-2",
            isInSidebar ? "bg-[#0f0f0f]" : "bg-[#0f0f0f] px-2"
          )}
        >
          {rootSpans.length > 0 ? (
            rootSpans.map((rootSpan, index) => (
              <SingleRunTimelineView
                key={rootSpan.span_id}
                rootSpanId={rootSpan.span_id}
                index={index}
                isInSidebar={isInSidebar}
              />
            ))
          ) : (
            <div className="flex items-center justify-center p-4 text-sm text-gray-400">
              No spans available for this run
            </div>
          )}
        </div>
      </div>
    </RunDetailProvider>
  );
};