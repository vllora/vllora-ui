import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import { TimelineVisualization } from "./timeline-visualization";
import { SidebarTimelineContent } from "./sidebar-timeline-content";
import { classNames } from "@/utils/modelUtils";
import { Span } from "@/types/common-type";

// Base props for timeline content components
export interface TimelineContentBaseProps {
    level: number;
    hasChildren: boolean;
    isOpen: boolean;
    titleWidth: number | string;
    title: string;
    operationIcon: ReactNode;
    operationIconColor: string;
    durationSeconds: number;
    onToggle: () => void;
    operation_name: string;
    span?: Span;
    isInSidebar?: boolean;
}

// Main TimelineRow component props
export interface TimelineRowProps {
    span: Span;
    level: number;
    hasChildren: boolean;
    isOpen: boolean;
    titleWidth: number | string;
    title: string;
    operationIcon: React.ReactNode;
    operationIconColor: string;
    durationSeconds: number;
    widthPercent: string;
    offsetPercent: string;
    onToggle: () => void;
    isInSidebar?: boolean;
    timelineBgColor: string;
    selectedSpanId?: string;
    onSpanSelect?: (spanId: string, runId: string) => void;
}

// Main TimelineRow component that uses the sub-components
export const TimelineRow = (props: TimelineRowProps) => {
    const {
        span,
        level,
        hasChildren,
        isOpen,
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
        isInSidebar = true
    } = props;    
    // Common props for timeline content components
    const contentProps = {
        level,
        hasChildren,
        isOpen,
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
    return (
        <div
            key={span.span_id}
            data-span-id={span.span_id}
            className={cn(
                "w-full group transition-colors hover:cursor-pointer",
                selectedSpanId && span.span_id === selectedSpanId ? "border-l-2 !border-l-[rgb(var(--theme-500))]" : "hover:bg-[#151515] border-l-2 !border-l-transparent"
            )}
            onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (onSpanSelect) {
                    onSpanSelect(span.span_id, span.run_id);
                }
            }}
        >
            <div className={classNames("flex w-full divide-x divide-border px-1")}>
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
