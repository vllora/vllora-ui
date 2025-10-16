import { cn } from "@/lib/utils";
import { Span } from "@/types/common-type";

// Props for the TimelineVisualization component
interface TimelineVisualizationProps {
    span: Span;
    widthPercent: string;
    offsetPercent: string;
    selectedSpanId?: string | null;
    timelineBgColor: string;
}

// Timeline visualization component
export const TimelineVisualization = (props: TimelineVisualizationProps) => {
    const { span, widthPercent, offsetPercent, selectedSpanId, timelineBgColor } = props;
    return (
        <div className="flex-grow h0 ">
            <div className="relative w-full h-full">
                {/* Full span background */}
                <div className="absolute inset-0 flex items-center">
                    <div
                        className={cn(
                            "h-[16px] w-full rounded-sm relative overflow-hidden transition-colors duration-300",
                        )}
                        style={{
                            backgroundColor: span.isInProgress ? 'rgba(16, 185, 129, 0.1)' : `${timelineBgColor}0D`,
                        }} /* Green background for in-progress spans to harmonize with animation */
                    >
                        {/* Loading progress animation for in-progress spans */}
                        {span.isInProgress && (
                            <div className="absolute inset-0 overflow-hidden rounded-sm">
                                <div
                                    className="absolute inset-y-0 w-1/4 animate-progress-slide"
                                    style={{
                                        background: 'linear-gradient(90deg, transparent 0%, rgba(16, 185, 129, 0.35) 50%, transparent 100%)',
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>
                
                {/* Grid lines - match the header grid */}
                <div className="absolute inset-0 flex pointer-events-none">
                    <div className="w-1/4 h-full border-r border-border"></div>
                    <div className="w-1/4 h-full border-r border-border"></div>
                    <div className="w-1/4 h-full border-r border-border"></div>
                    <div className="w-1/4 h-full"></div>
                </div>
                
                {/* Timeline bar */}
                <div className="absolute inset-0 flex items-center">
                    <div
                        className={cn(
                            "h-[6px] rounded-full transition-all duration-200 relative overflow-hidden",
                            "group-hover:h-[8px] group-hover:shadow-md",
                            span.span_id === selectedSpanId ? "ring-1 ring-white/20" : ""
                        )}
                        style={{
                            width: `${widthPercent}%`,
                            marginLeft: `${offsetPercent}%`,
                            backgroundColor: timelineBgColor,
                            backgroundImage: span.operation_name === 'tools'
                                ? 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.15) 5px, rgba(255,255,255,0.15) 10px)'
                                : 'none'
                        }}
                    >
                        {/* Shimmer animation for processing spans on timeline bar */}
                        {span.isInProgress && (
                            <div className="absolute inset-0 overflow-hidden rounded-full">
                                <div
                                    className="absolute inset-y-0 w-1/3 animate-progress-slide"
                                    style={{
                                        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)',
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};