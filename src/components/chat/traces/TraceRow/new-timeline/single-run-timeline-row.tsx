import { Span } from "@/services/traces";
import { RunDetailConsumer } from "@/context/run-detail";
import { classNames } from "@/components/utils";
import { getOperationIcon, getOperationIconColor, getSpanTitle } from "./utils";
import { Tooltip } from "@mui/material";
import { generateHex } from "../utils";
import { cn } from "@/lib/utils";
import { TracesConsumer } from "@/context/traces";
import { getClientSDKName, isAgentSpan } from "../../Graph/util";
import { getAgentName } from "../../Graph/client-sdk-nodes/util";
import { ClientSdkIcon } from "@/components/client-sdk-icon";

export const SingleRunTimelineRow = (props: {
    span: Span,
    totalDuration: number,
    startTime: number,
    finish_time_us?: number,
    level: number,
    titleWidth?: number,
    isFullscreen?: boolean
}) => {
    const { span, totalDuration, startTime, finish_time_us, level, titleWidth = 140, isFullscreen = false } = props;
    const duration = (finish_time_us ? finish_time_us : span.finish_time_us) - span.start_time_us;
    const widthPercent = (duration / totalDuration * 100).toFixed(0);
    const offsetPercent = (((span.start_time_us - startTime) / totalDuration) * 100).toFixed(0);
    const durationSeconds = (duration / 1000000)

    const { spans } = RunDetailConsumer();
    const { selectedSpanInfo, setSelectedSpanInfo } = TracesConsumer();
    const operationIcon = getOperationIcon({
        span: span,
        relatedSpans: spans
    });
    const operationIconColor = getOperationIconColor({
        span: span,
        relatedSpans: spans
    });
    const title = getSpanTitle({
        span: span,
        relatedSpans: spans
    });
    const isAgent = isAgentSpan(span);
    const sdkName = getClientSDKName(span);
    
    return (
        <div
            key={span.span_id}
            className={classNames(
                "w-full py-1.5 group transition-colors hover:cursor-pointer",
                selectedSpanInfo && selectedSpanInfo.spanId === span.span_id ? "bg-[#1a1a1a]" : "hover:bg-[#151515]"
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
            <div className="flex w-full">
                {/* Left side - Operation name and duration */}
                <div style={{ width: titleWidth }} className="flex-shrink-0 pl-2 pr-3">
                    <div className="text-xs overflow-hidden">
                        <div className="flex items-center text-left">
                            <div className="flex items-center rounded w-full">
                                <div className="flex-1 flex justify-between items-center">
                                    <Tooltip title={title}>
                                        <div className="flex items-center">
                                            {operationIcon && (
                                                <div><div className="mr-2 flex-shrink-0">
                                                    <div className={cn(
                                                        "rounded-sm",
                                                        isFullscreen ? "p-1.5 shadow-sm" : "p-1",
                                                        operationIconColor
                                                    )}>
                                                        {operationIcon}
                                                    </div>
                                                </div>
                                                {sdkName && (
                                                    <div className="flex-shrink-0">
                                                        <div className={cn(
                                                            "rounded-sm",
                                                            isFullscreen ? "p-1.5 shadow-sm" : "p-1",
                                                            operationIconColor
                                                        )}>
                                                            <ClientSdkIcon client_name={sdkName} />
                                                        </div>
                                                    </div>
                                                    )}
                                                </div>
                                            )}
                                            <span className={cn(
                                                "text-gray-300 truncate",
                                                isFullscreen ? "text-sm max-w-[250px]" : "text-xs max-w-[120px]"
                                            )}>
                                                {title}
                                            </span>
                                        </div>
                                    </Tooltip>
                                    <span className={cn(
                                        "text-blue-400 ml-2 whitespace-nowrap font-mono",
                                        isFullscreen ? "text-sm font-medium" : "text-xs"
                                    )}>
                                        {durationSeconds < 0.01 ? '<0.01s' : `${durationSeconds.toFixed(2)}s`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right side - Timeline visualization */}
                <div className="flex-grow">
                    <div className="relative w-full h-full">
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
                                    isFullscreen ? "h-[10px]" : "h-[8px]",
                                    "rounded-full transition-all duration-200",
                                    "group-hover:h-[12px] group-hover:shadow-md",
                                    selectedSpanInfo && selectedSpanInfo.spanId === span.span_id ? "ring-1 ring-white/20" : ""
                                )}
                                style={{
                                    width: `${widthPercent}%`,
                                    marginLeft: `${offsetPercent}%`,
                                    backgroundColor: generateHex(span.operation_name),
                                    backgroundImage: span.operation_name === 'tools'
                                        ? 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.15) 5px, rgba(255,255,255,0.15) 10px)'
                                        : 'none'
                                }}
                            ></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

}