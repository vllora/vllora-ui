import { cn } from "@/lib/utils";
import { ReactNode, useMemo, useState } from "react";
import { TimelineVisualization } from "./timeline-visualization";
import { SidebarTimelineContent } from "./sidebar-timeline-content";
import { classNames } from "@/utils/modelUtils";
import { Span } from "@/types/common-type";
import { Eye } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BreakpointIcon } from "@/components/Icons/BreakpointIcon";
import { BreakpointTooltipContent } from "./breakpoint-tooltip-content";
import { BreakpointsConsumer } from "@/lib";
import { EditRequestDialog } from "./EditRequestDialog";

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
    onHoverSpanChange?: (spanId: string | undefined) => void;
    showHighlightButton?: boolean;
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
        onHoverSpanChange,
        isInSidebar = true,
        showHighlightButton = false
    } = props;
    const { continueBreakpoint } = BreakpointsConsumer();
        const [editedRequest, setEditedRequest] = useState<string>("");
        const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

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
    const getStoredRequest = () => {
        const attribute = span?.attribute as Record<string, unknown> | undefined;
        let request = attribute?.request;
        if (typeof request === 'string') {
            try {
                request = JSON.parse(request);
            } catch {
                return null;
            }
        }
        return request;
    };
    const handleContinueOriginal = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (span?.span_id) {
            continueBreakpoint(span.span_id, null);
        }
    };
     const handleContinueWithEdit = () => {
        if (span?.span_id) {
            try {
                const parsedRequest = JSON.parse(editedRequest);
                continueBreakpoint(span.span_id, parsedRequest);
                setIsEditDialogOpen(false);
            } catch {
                // Invalid JSON, don't continue
            }
        }
    };

    // Open edit dialog
    const handleOpenEditDialog = (e: React.MouseEvent) => {
        e.stopPropagation();
        const request = getStoredRequest();
        setEditedRequest(request ? JSON.stringify(request, null, 2) : "{}");
        setIsEditDialogOpen(true);
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
    
    const isCurrentlyHighlighted = hoverSpanId === span.span_id;

    const handleEyeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (isCurrentlyHighlighted) {
            onHoverSpanChange?.(undefined);
        } else {
            onHoverSpanChange?.(span.span_id);
        }
    };

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
            <div className={classNames(`flex w-full divide-x divide-border/50 ${!showHighlightButton ? "px-1" : ""}`)}>
                {/* Eye icon for highlighting - only shown in threads tab */}
                {showHighlightButton && !span.isInDebug && (
                    <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={handleEyeClick}
                                    className={cn(
                                        "flex items-center justify-center w-5 h-5 shrink-0 rounded transition-colors self-center",
                                        "text-muted-foreground/50 hover:text-muted-foreground opacity-0 group-hover:opacity-100"
                                    )}
                                >
                                    <Eye className="w-3 h-3" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                <p>Find in chat</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
                {span.isInDebug && <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex items-center justify-center w-5 h-5 shrink-0 self-center">
                                    <BreakpointIcon className="text-yellow-500" />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <BreakpointTooltipContent
                                                request={getStoredRequest()}
                                                onContinue={handleContinueOriginal}
                                                onEditAndContinue={handleOpenEditDialog}
                                            />
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>}

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
            <EditRequestDialog
                open={isEditDialogOpen}
                onOpenChange={setIsEditDialogOpen}
                value={editedRequest}
                onChange={setEditedRequest}
                onContinue={handleContinueWithEdit}
            />
        </div>
    );
};
