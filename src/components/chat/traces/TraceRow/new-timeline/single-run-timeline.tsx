import { HierarchyRow } from "./hierarchy-row";
import { RunDetailConsumer } from "@/contexts/RunDetailContext";
import { useMemo } from "react";
import { Span } from "@/types/common-type";
import { TIMELINE_DYNAMIC_TITLE_WIDTH_FULL_SIZE, TIMELINE_DYNAMIC_TITLE_WIDTH_IN_SIDEBAR } from "@/utils/constant";

export interface SingleRunTimelineViewProps {
    index: number;
    isInSidebar?: boolean;
    currentSpanHierarchy: Span;
    selectedSpanId?: string;
    onSpanSelect?: (spanId: string, runId?: string) => void;
    level: number;
    hoverSpanId?: string;
    onHoverSpanChange?: (spanId: string | undefined) => void;
    collapsedSpans?: string[];
    onToggle?: (spanId: string) => void;
    showHighlightButton?: boolean;
    selectedLabels?: string[];
}

export const SingleRunTimelineView = (props: SingleRunTimelineViewProps) => {
    const { isInSidebar = true, selectedSpanId, onSpanSelect, currentSpanHierarchy, level, index, hoverSpanId, onHoverSpanChange, collapsedSpans, onToggle, showHighlightButton, selectedLabels } = props;
    const { spansByRunId, startTime, totalDuration } = RunDetailConsumer();
    // Dynamic title width based on display mode - wider when not in sidebar
    const titleWidth: string | number = useMemo(() => isInSidebar ? `${TIMELINE_DYNAMIC_TITLE_WIDTH_IN_SIDEBAR}px` : `${TIMELINE_DYNAMIC_TITLE_WIDTH_FULL_SIZE}px`, [isInSidebar]);

    // Calculate total duration and start time for width calculations

    return (
        <div className="flex flex-col space-y-1 divide-y divide-border/50 first:mt-0">
            {/* Timeline header with ticks */}
            {index === 0 && (
                <div className="flex flex-col">
                    <div className="flex w-full">
                        <div style={{ width: titleWidth }} className="flex-shrink-0"></div>
                        <div className="flex-grow relative">
                            <div className="relative w-full h-5">
                                {/* Time markers */}
                                <div className="absolute left-0 bottom-1 text-[10px] text-white font-semibold whitespace-nowrap">0.0s</div>
                                <div className="absolute left-1/4 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-white whitespace-nowrap">
                                    { totalDuration === -Infinity ? 0 : (totalDuration * 0.25 / 1000000).toFixed(1)}s
                                </div>
                                <div className="absolute left-1/2 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-white whitespace-nowrap">
                                    {totalDuration === -Infinity ? 0 :  (totalDuration * 0.5 / 1000000).toFixed(1)}s
                                </div>
                                <div className="absolute left-3/4 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-white whitespace-nowrap">
                                    {totalDuration === -Infinity ? 0 : (totalDuration * 0.75 / 1000000).toFixed(1)}s
                                </div>
                                <div className="absolute right-0 bottom-1 text-right text-[10px] font-semibold text-white whitespace-nowrap">
                                    {totalDuration === -Infinity ? 0 : (totalDuration / 1000000).toFixed(1)}s
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Hierarchy tree with timeline bars */}
            <div className="overflow-hidden">
                <HierarchyRow
                    level={level}
                    key={`span-timeline-hierarchy-${currentSpanHierarchy.span_id}`}
                    hierarchy={currentSpanHierarchy}
                    totalDuration={totalDuration}
                    startTime={startTime}
                    titleWidth={titleWidth}
                    relatedSpans={spansByRunId}
                    selectedSpanId={selectedSpanId}
                    onSpanSelect={onSpanSelect}
                    isInSidebar={isInSidebar}
                    hoverSpanId={hoverSpanId}
                    onHoverSpanChange={onHoverSpanChange}
                    collapsedSpans={collapsedSpans}
                    onToggle={onToggle}
                    showHighlightButton={showHighlightButton}
                    selectedLabels={selectedLabels}
                />
            </div>
        </div>
    );
}


