import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import { TimelineVisualization } from "./timeline-visualization";
import { FullscreenTimelineContent } from "./fullscreen-timeline-content";
import { SidebarTimelineContent } from "./sidebar-timeline-content";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
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
    } = props;
    // Get context data
    const { setSelectedSpanInfo, selectedSpanInfo } = ChatWindowConsumer();
    // In ellora-ui, we're always in sidebar mode (chat sidebar)
    const isInSidebar = true;
    
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
        span
    };
    
    return (
        <div 
            key={span.span_id} 
            data-span-id={span.span_id}
            className={cn(
                "w-full group transition-colors hover:cursor-pointer",
                selectedSpanInfo && selectedSpanInfo.spanId && span.span_id === selectedSpanInfo?.spanId ? "border-l-2 !border-l-primary" : "hover:bg-[#151515] border-l-2 !border-l-transparent"
            )}
            onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setSelectedSpanInfo({
                    spanId: span.span_id,
                    runId: span.run_id
                });
            }}
        >
            <div className={classNames("flex w-full divide-x divide-border px-1")}>
                {/* Render either fullscreen or sidebar content based on mode */}
                {!isInSidebar 
                    ? <FullscreenTimelineContent {...contentProps} /> 
                    : <SidebarTimelineContent {...contentProps} />
                }
                
                {/* Timeline visualization */}
                <TimelineVisualization 
                    span={span}
                    widthPercent={widthPercent}
                    offsetPercent={offsetPercent}
                    selectedSpanId={selectedSpanInfo?.spanId}
                    timelineBgColor={timelineBgColor}
                />
            </div>
        </div>
    );
};
