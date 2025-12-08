import { useState } from "react";
import { TimelineContentBaseProps } from ".";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getOperationTitle, getLabelOfSpan, getModelName, getTotalUsage, getCost } from "../utils";
import { DatabaseIcon, ChevronRight, ChevronDown, TriangleAlertIcon, PauseCircle } from "lucide-react";
import { BreakpointsConsumer } from "@/contexts/breakpoints";
import { getClientSDKName, isAgentSpan, isPromptCachingApplied } from "@/utils/graph-utils";
import { ClientSdkIcon } from "@/components/client-sdk-icon";
import { getTimelineTitleWidth, TIMELINE_INDENTATION } from "@/utils/constant";
import { LabelTag } from "./label-tag";
import { ModelContextViewer } from "../../span-info/DetailView/spans-display/model-context-viewer";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BreakpointTooltipContent } from "./breakpoint-tooltip-content";
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";
import { Pencil, Play } from "lucide-react";

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
    const { continueBreakpoint } = BreakpointsConsumer();
    const sdkName = span && getClientSDKName(span);
    const agentSpan = span && isAgentSpan(span);
    const isPromptCached = span && isPromptCachingApplied(span);
    const labelOfSpan = span && getLabelOfSpan({ span });
    const modelName = span && getModelName({ span });
    const totalUsage = span && getTotalUsage({ span }) || 0;
    const cost = span && getCost({ span }) || 0;
    const error = span && span.attribute?.error;

    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editedRequest, setEditedRequest] = useState<string>("");

    // Get the stored request from span attribute
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

    // Continue with original request
    const handleContinueOriginal = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (span?.span_id) {
            continueBreakpoint(span.span_id, null);
        }
    };

    // Open edit dialog
    const handleOpenEditDialog = (e: React.MouseEvent) => {
        e.stopPropagation();
        const request = getStoredRequest();
        setEditedRequest(request ? JSON.stringify(request, null, 2) : "{}");
        setIsEditDialogOpen(true);
    };

    // Continue with edited request
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
    return (
        <div
            style={{ width: titleWidth }}
            className={`flex-shrink-0 pl-0 pr-1 py-1 ${span?.isInDebug ? "bg-yellow-500/20 border-l-2 border-l-yellow-500" : ""}`}
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
                            <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className={`mr-1 flex-shrink-0 cursor-pointer`}>
                                            {/* Icon display with potential cache indicator */}
                                            <div className="relative">
                                                {span?.isInDebug ? (
                                                    <button
                                                        onClick={handleContinueOriginal}
                                                        className={`p-1 rounded-full bg-yellow-500/30 hover:bg-yellow-500/40 transition-colors`}
                                                    >
                                                        <PauseCircle className="w-3.5 h-3.5 text-yellow-500" />
                                                    </button>
                                                ) : (
                                                    <div className={`p-1 rounded-full ${operationIconColor}`}>
                                                        {operationIcon}
                                                    </div>
                                                )}
                                                {sdkName && !agentSpan && !span?.isInDebug && (
                                                    <div className="absolute -bottom-0 -right-1  bg-gray-800 rounded-full p-0.5 border border-gray-700 shadow-sm">
                                                        <ClientSdkIcon client_name={sdkName} className="w-2.5 h-2.5" />
                                                    </div>
                                                )}
                                                {/* Cache indicator as subscript icon */}
                                                {operation_name === 'cache' && !span?.isInDebug && (
                                                    <div className="absolute -bottom-0 -right-1 bg-gray-800 rounded-full p-0.5 border border-gray-700 shadow-sm">
                                                        <DatabaseIcon className="w-2.5 h-2.5 text-blue-400" />
                                                    </div>
                                                )}
                                                {/* Prompt caching indicator as subscript icon */}
                                                {isPromptCached && !span?.isInDebug && (
                                                    <div className="absolute -bottom-0 -right-1 bg-gray-800 rounded-full p-0.5 border border-gray-700 shadow-sm">
                                                        <DatabaseIcon className="w-2.5 h-2.5 text-amber-400" />
                                                    </div>
                                                )}
                                                {/* Error indicator as subscript icon */}
                                                {error && !span?.isInDebug && (
                                                    <div className="absolute -bottom-0 -right-1 p-0.5">
                                                        <TriangleAlertIcon className="w-2.5 h-2.5 text-amber-400" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </TooltipTrigger>
                                    {span?.isInDebug ? (
                                        <TooltipContent side="right" className="max-w-md p-0">
                                            <BreakpointTooltipContent
                                                request={getStoredRequest()}
                                                onContinue={handleContinueOriginal}
                                                onEditAndContinue={handleOpenEditDialog}
                                            />
                                        </TooltipContent>
                                    ) : (
                                        <TooltipContent side="bottom" className="text-xs">
                                            {getOperationTitle({ operation_name, span })}
                                        </TooltipContent>
                                    )}
                                </Tooltip>
                            </TooltipProvider>
                        )}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className="flex flex-col items-left min-w-0 h-full justify-between"
                                        style={{ maxWidth: `${Math.max(getTimelineTitleWidth({ level, isInSidebar }), 20)}px` }}
                                    >
                                        <span className={`text-xs text-gray-300 truncate leading-normal`}>
                                            {title}
                                        </span>
                                        {labelOfSpan && (
                                            <div className="">
                                                <LabelTag label={labelOfSpan} maxWidth={Math.max(getTimelineTitleWidth({ level, isInSidebar }), 20)} />
                                            </div>
                                        )}


                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs flex flex-col gap-2">

                                    <div className="flex items-center gap-1">
                                        {(!modelName || !totalUsage) && <span>{getOperationTitle({ operation_name, span })}: {title}</span>}
                                        {labelOfSpan && <span className="opacity-70">{labelOfSpan}</span>}
                                    </div>
                                    {modelName && totalUsage > 0 && (
                                        <ModelContextViewer model_name={modelName} usage_tokens={totalUsage} cost={cost} expandMode={true} />
                                    )}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <span className="text-blue-400 text-xs whitespace-nowrap font-mono flex-shrink-0 text-[10px]">
                        {durationSeconds < 0.01 ? '<0.01s' : `${durationSeconds.toFixed(2)}s`}
                    </span>
                </div>
            </div>

            {/* Edit Request Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] p-0 gap-0" onClick={(e) => e.stopPropagation()}>
                    <div className="p-4 space-y-4">
                        {/* Header - matching BreakpointTooltipContent style */}
                        <div className="flex items-center gap-2 text-yellow-500 font-medium text-sm">
                            <Pencil className="w-4 h-4" />
                            <span>Edit Request</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Modify the request JSON and continue execution
                        </p>

                        {/* JSON Editor */}
                        <div className="h-[400px]">
                            <JsonEditor
                                value={editedRequest}
                                onChange={setEditedRequest}
                            />
                        </div>

                        {/* Action Buttons - matching BreakpointTooltipContent style */}
                        <div className="flex gap-2 pt-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                onClick={() => setIsEditDialogOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 gap-1.5 text-green-500 border-green-500/50 hover:bg-green-500/10 hover:text-green-400"
                                onClick={handleContinueWithEdit}
                            >
                                <Play className="w-3.5 h-3.5" />
                                Continue
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};