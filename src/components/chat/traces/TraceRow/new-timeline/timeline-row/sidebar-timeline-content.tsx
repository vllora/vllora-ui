
import { TimelineContentBaseProps } from ".";
import { classNames } from "@/utils/modelUtils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getOperationTitle, getLabelOfSpan } from "../utils";
import { DatabaseIcon, ChevronRight, ChevronDown } from "lucide-react";
import { getClientSDKName, isAgentSpan, isPromptCachingApplied } from "@/utils/graph-utils";
import { ClientSdkIcon } from "@/components/client-sdk-icon";
import { getTimelineTitleWidth, TIMELINE_INDENTATION } from "@/utils/constant";
import { LabelTag } from "./label-tag";

// Props for the SidebarTimelineContent component
interface SidebarTimelineContentProps extends TimelineContentBaseProps { }

// Sidebar mode timeline content component
export const SidebarTimelineContent = (props: SidebarTimelineContentProps) => {
    const {
        level,
        hasChildren,
        collapsedSpans,
        titleWidth,
        title,
        operationIcon,
        operationIconColor,
        durationSeconds,
        operation_name,
        span,
        onToggle,
        isInSidebar = true
    } = props;
    const sdkName = span && getClientSDKName(span);
    const agentSpan = span && isAgentSpan(span);
    const isPromptCached = span && isPromptCachingApplied(span);
    const labelOfSpan = span && getLabelOfSpan({ span });
    return (
        <div
            style={{ width: titleWidth }}
            className="flex-shrink-0 pl-0 pr-1 py-1"
        >
            <div className="flex items-center w-full ">
                {/* Fake indentation by adding left padding - smaller in sidebar */}
                <div style={{ width: `${level * TIMELINE_INDENTATION}px` }} className="flex-shrink-0"></div>

                {/* Expand/Collapse Chevron */}
                {hasChildren ? (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            span && onToggle(span.span_id);
                        }}
                        className="flex-shrink-0 mr-1 hover:bg-accent rounded p-0.5 transition-colors"
                    >
                        {!(collapsedSpans?.includes(span?.span_id || "")) ? (
                            <ChevronDown className="w-3 h-3 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        )}
                    </button>
                ) : (
                    <div className="w-4 flex-shrink-0" />
                )}

                {/* Super compact title and duration */}
                <div className="flex justify-between items-center w-full gap-1 h-full">
                    <div className="flex items-center min-w-0 flex-1 truncate h-full">
                        {operationIcon && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className={`mr-1 flex-shrink-0 ${labelOfSpan ? 'pb-3' : ''}`}>
                                            {/* Icon display with potential cache indicator */}
                                            <div className="relative">
                                                <div className={classNames("p-1 rounded-full ", operationIconColor)}>
                                                    {operationIcon}
                                                </div>
                                                {sdkName && !agentSpan && (
                                                    <div className="absolute -bottom-1 -right-1  bg-gray-800 rounded-full p-0.5 border border-gray-700 shadow-sm">
                                                        <ClientSdkIcon client_name={sdkName} className="w-2.5 h-2.5" />
                                                    </div>
                                                )}
                                                {/* Cache indicator as subscript icon */}
                                                {operation_name === 'cache' && (
                                                    <div className="absolute -bottom-1 -right-1 bg-gray-800 rounded-full p-0.5 border border-gray-700 shadow-sm">
                                                        <DatabaseIcon className="w-2.5 h-2.5 text-blue-400" />
                                                    </div>
                                                )}
                                                {/* Prompt caching indicator as subscript icon */}
                                                {isPromptCached && (
                                                    <div className="absolute -bottom-1 -right-1 bg-gray-800 rounded-full p-0.5 border border-gray-700 shadow-sm">
                                                        <DatabaseIcon className="w-2.5 h-2.5 text-amber-400" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="text-xs">
                                        {getOperationTitle({ operation_name, span })}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className="inline-flex items-center min-w-0 h-full justify-center gap-1"
                                        style={{ maxWidth: `${Math.max(getTimelineTitleWidth({ level, isInSidebar }), 20)}px` }}
                                    >
                                        <span className={`text-xs text-gray-300 truncate leading-normal ${labelOfSpan ? 'pb-3' : ''}`}>
                                            {title}
                                        </span>
                                        {labelOfSpan && (
                                            <div className="relative top-2 -left-9">
                                                <LabelTag label={labelOfSpan} />
                                            </div>
                                        )}

                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">
                                    {getOperationTitle({ operation_name, span })}: {title}
                                    {labelOfSpan && <span className="ml-1 opacity-70">({labelOfSpan})</span>}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <span className="text-blue-400 text-xs whitespace-nowrap font-mono flex-shrink-0 text-[10px]">
                        {durationSeconds < 0.01 ? '<0.01s' : `${durationSeconds.toFixed(2)}s`}
                    </span>
                </div>
            </div>
        </div>
    );
};