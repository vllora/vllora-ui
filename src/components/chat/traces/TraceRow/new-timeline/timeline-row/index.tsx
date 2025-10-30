import { cn } from "@/lib/utils";
import { ReactNode, useMemo } from "react";
import { TimelineVisualization } from "./timeline-visualization";
import { SidebarTimelineContent } from "./sidebar-timeline-content";
import { classNames } from "@/utils/modelUtils";
import { Span } from "@/types/common-type";

// Base props for timeline content components
export interface TimelineContentBaseProps {
    level: number;
    hasChildren: boolean;
    collapsedSpans?: string[];
    titleWidth: number | string;
    title: string;
    operationIcon: ReactNode;
    operationIconColor: string;
    durationSeconds: number;
    onToggle: (spanId: string) => void;
    operation_name: string;
    span?: Span;
    isInSidebar?: boolean;
}

// Main TimelineRow component props
export interface TimelineRowProps {
    span: Span;
    level: number;
    hasChildren: boolean;
    collapsedSpans?: string[];
    titleWidth: number | string;
    title: string;
    operationIcon: React.ReactNode;
    operationIconColor: string;
    durationSeconds: number;
    widthPercent: string;
    offsetPercent: string;
    onToggle: (spanId: string) => void;
    isInSidebar?: boolean;
    timelineBgColor: string;
    selectedSpanId?: string;
    onSpanSelect?: (spanId: string, runId: string) => void;
    hoverSpanId?: string;
}

// Main TimelineRow component that uses the sub-components
export const TimelineRow = (props: TimelineRowProps) => {
    const {
        span,
        level,
        hasChildren,
        collapsedSpans,
        titleWidth,
        title,
        operationIcon,
        operationIconColor,
        durationSeconds,
        widthPercent,
        offsetPercent,
        timelineBgColor,
        onToggle,
        selectedSpanId,
        onSpanSelect,
        hoverSpanId,
        isInSidebar = true
    } = props;
    // Common props for timeline content components
    const contentProps = {
        level,
        hasChildren,
        collapsedSpans,
        titleWidth,
        title,
        operationIcon,
        operationIconColor,
        durationSeconds,
        onToggle,
        timelineBgColor: timelineBgColor,
        operation_name: span.operation_name,
        span,
    };

    const classNameOfCurrentSpan = useMemo(() => {
        let isSelected = selectedSpanId && span.span_id === selectedSpanId
        let isHovered = hoverSpanId && span.span_id === hoverSpanId
        if(isSelected && isHovered) {
            return "bg-amber-500/5 border border-amber-500/40 !border-l-4 !border-l-amber-500 shadow-md shadow-amber-500/10";
        }
        if(isSelected){
            return "border border-transparent !border-l-4 !border-l-[rgb(var(--theme-500))]";
        }
        if(isHovered){
            return "bg-amber-500/5 border border-amber-500/40 !border-l-4 !border-l-amber-500 shadow-md shadow-amber-500/10";
        }
        return "hover:bg-[#151515] border border-transparent !border-l-4 !border-l-transparent";
    }, [span.span_id, selectedSpanId, hoverSpanId]);
    
    return (
        <div
            key={`span-timeline-row-${span.span_id}`}
            data-span-id={span.span_id}
            className={cn(
                "w-full group hover:cursor-pointer transition-all duration-300 ease-out",
                classNameOfCurrentSpan
            )}
            onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (onSpanSelect) {
                    onSpanSelect(span.span_id, span.run_id);
                }
            }}
        >
            <div className={classNames("flex w-full divide-x divide-border/50 px-1")}>
                {/* Render either fullscreen or sidebar content based on mode */}
                <SidebarTimelineContent {...contentProps} isInSidebar={isInSidebar} />


                {/* Timeline visualization */}
                <TimelineVisualization
                    span={span}
                    widthPercent={widthPercent}
                    offsetPercent={offsetPercent}
                    selectedSpanId={selectedSpanId}
                    timelineBgColor={timelineBgColor}
                />
            </div>
        </div>
    );
};
