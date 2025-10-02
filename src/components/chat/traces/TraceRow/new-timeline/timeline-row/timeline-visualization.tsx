import { Span } from "@/services/runs-api";
import { cn } from "@/lib/utils";

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
                        className="h-[16px] w-full rounded-sm" 
                        style={{ backgroundColor: `${timelineBgColor}0D` }} /* 0D is hex for 5% opacity */
                    ></div>
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
                            "h-[6px] rounded-full transition-all duration-200",
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
                    ></div>
                </div>
            </div>
        </div>
    );
};