import { HierarchyRow } from "./hierarchy-row";
import { RunDetailConsumer } from "@/contexts/RunDetailContext";
import { useMemo } from "react";

export interface SingleRunTimelineViewProps {
    rootSpanId: string;
    index: number;
    isInSidebar?: boolean;
}

export const SingleRunTimelineView = (props: SingleRunTimelineViewProps) => {
    const { rootSpanId, index, isInSidebar = false } = props;
    const { spans, hierarchies, rootSpans } = RunDetailConsumer();
    // Dynamic title width based on display mode - wider when not in sidebar
    const titleWidth: string | number = useMemo(() => isInSidebar ? `${180}px` : '20vw', [isInSidebar]);
    console.log("==== SingleRunTimelineView spans", spans)
    console.log("==== SingleRunTimelineView rootSpans", rootSpans)
    console.log("==== SingleRunTimelineView rootSpanId", rootSpanId)
    const rootSpan = rootSpans.find(span => `${span.span_id}` === `${rootSpanId}`);
    console.log("==== SingleRunTimelineView rootSpan", rootSpan)
    console.log("==== SingleRunTimelineView hierarchies", hierarchies)
    const hierarchy = rootSpan ? hierarchies[rootSpan.span_id] : null;
    console.log("==== SingleRunTimelineView hierarchy", hierarchy)

    if (!hierarchy) {
        return <></>;
    }

    // Calculate total duration and start time for width calculations
    const startTime = Math.min(...spans.map(span => span.start_time_us));
    const endTime = Math.max(...spans.map(span => span.finish_time_us));
    const totalDuration = endTime - startTime;
    const totalDurationSeconds = (totalDuration / 1000000).toFixed(2);
    return (
        <div className="flex flex-col space-y-1 mt-2 first:mt-0">
            {/* Timeline header with ticks */}
            {index === 0 && (
                <div className="flex flex-col">
                    {/* <div className="flex items-center gap-2 mb-2 px-2">
                        <ClockIcon className="h-3 w-3 text-gray-400" />
                        <span className="text-xs text-gray-400">Total Duration: {totalDurationSeconds}s</span>
                    </div> */}

                    <div className="flex w-full">
                        <div style={{ width: titleWidth }} className="flex-shrink-0"></div>
                        <div className="flex-grow relative">
                            <div className="relative w-full h-5">
                                {/* Time markers */}
                                <div className="absolute left-0 bottom-1 text-[10px] text-white font-semibold whitespace-nowrap">0.0s</div>
                                <div className="absolute left-1/4 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-white whitespace-nowrap">
                                    {(totalDuration * 0.25 / 1000000).toFixed(1)}s
                                </div>
                                <div className="absolute left-1/2 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-white whitespace-nowrap">
                                    {(totalDuration * 0.5 / 1000000).toFixed(1)}s
                                </div>
                                <div className="absolute left-3/4 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-white whitespace-nowrap">
                                    {(totalDuration * 0.75 / 1000000).toFixed(1)}s
                                </div>
                                <div className="absolute right-0 bottom-1 text-right text-[10px] font-semibold text-white whitespace-nowrap">
                                    {(totalDuration / 1000000).toFixed(1)}s
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Hierarchy tree with timeline bars */}
            <div className="rounded-md border border-border overflow-hidden">
                <HierarchyRow
                    level={0}
                    hierarchy={hierarchy}
                    totalDuration={totalDuration}
                    startTime={startTime}
                    titleWidth={titleWidth}
                />
            </div>
        </div>
    );
}


