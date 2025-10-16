
import { TimelineContentBaseProps } from ".";
import { classNames } from "@/utils/modelUtils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getOperationTitle } from "../utils";
import { DatabaseIcon } from "lucide-react";
import { getClientSDKName, isPromptCachingApplied } from "@/utils/graph-utils";
import { ClientSdkIcon } from "@/components/client-sdk-icon";

// Props for the SidebarTimelineContent component
interface SidebarTimelineContentProps extends TimelineContentBaseProps { }

// Sidebar mode timeline content component
export const SidebarTimelineContent = (props: SidebarTimelineContentProps) => {
    const {
        level,
        titleWidth,
        title,
        operationIcon,
        operationIconColor,
        durationSeconds,
        operation_name,
        span
    } = props;
    const sdkName = span && getClientSDKName(span);
    const isPromptCached = span && isPromptCachingApplied(span);
    return (
        <div
            style={{ width: titleWidth }}
            className="flex-shrink-0 pl-0 pr-1 py-1.5"
        >
            <div className="flex items-center w-full">
                {/* Fake indentation by adding left padding - smaller in sidebar */}
                <div style={{ width: `${level * 8}px` }} className="flex-shrink-0"></div>

                {/* Super compact title and duration */}
                <div className="flex justify-between items-center w-full">
                    <div className="flex items-center min-w-0 flex-1 mr-1">
                        {operationIcon && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="mr-1 flex-shrink-0">
                                            {/* Icon display with potential cache indicator */}
                                            <div className="relative">
                                                <div className={classNames("p-1 rounded-full ", operationIconColor)}>
                                                    {operationIcon}
                                                </div>
                                                {sdkName && (
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
                                    <span
                                        className="text-xs text-gray-300 truncate"
                                        style={{ maxWidth: `${Math.max(100 - level * 8, 20)}px` }}
                                    >
                                        {title}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">
                                    {getOperationTitle({ operation_name, span })}: {title}
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