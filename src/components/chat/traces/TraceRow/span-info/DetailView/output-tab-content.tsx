import { useLocalStorageState } from "ahooks";
import { JsonViewer } from "../JsonViewer";
import { MessageViewer } from "./message-viewer";
import { ToolDefinitionsViewer } from "./tool-definitions-viewer";
import { ViewerCollapsibleSection } from "./ViewerCollapsibleSection";
import { ViewModeToggle, ViewMode } from "./view-mode-toggle";
import {
    WrenchScrewdriverIcon,
    CheckCircleIcon,
    XCircleIcon,
    ClockIcon,
    StopIcon,
    FlagIcon,
    CodeBracketIcon,
} from "@heroicons/react/24/outline";
import { AlertTriangle } from "lucide-react";
import { extractResponseMessage } from "@/utils/extractResponseMessage";

// Helper function to get finish reason styling and information
const getFinishReasonInfo = (finishReason: string) => {
    const reason = finishReason?.toLowerCase();

    switch (reason) {
        case 'stop':
            return {
                icon: CheckCircleIcon,
                label: 'Stop',
                description: 'The model completed the response naturally'
            };
        case 'length':
            return {
                icon: StopIcon,
                label: 'Length Limit',
                description: 'The response was cut off due to maximum length constraints'
            };
        case 'tool_calls':
            return {
                icon: WrenchScrewdriverIcon,
                label: 'Tool Called',
                description: 'The model made tool calls and is waiting for responses'
            };
        case 'content_filter':
            return {
                icon: XCircleIcon,
                label: 'Content Filtered',
                description: 'The response was blocked by content filtering policies'
            };
        case 'timeout':
            return {
                icon: ClockIcon,
                label: 'Timeout',
                description: 'The request timed out before completion'
            };
        case 'error':
            return {
                icon: AlertTriangle,
                label: 'Error',
                description: 'An error occurred during response generation'
            };
        default:
            return {
                icon: CheckCircleIcon,
                label: finishReason || 'Unknown',
                description: `Response finished with reason: ${finishReason || 'unknown'}`
            };
    }
};

interface OutputTabContentProps {
    response: any;
    otherLevelMessages?: string[];
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    onCopy: () => void;
    copied: boolean;
}

export const OutputTabContent = ({ response, otherLevelMessages, viewMode, onViewModeChange, onCopy, copied }: OutputTabContentProps) => {
    const [finishReasonCollapsed, setFinishReasonCollapsed] = useLocalStorageState<boolean>('vllora-traces-output-finish-reason-collapsed', {
        defaultValue: false,
    });
    const [messagesCollapsed, setMessagesCollapsed] = useLocalStorageState<boolean>('vllora-traces-output-messages-collapsed', {
        defaultValue: false,
    });
    const [toolCallsCollapsed, setToolCallsCollapsed] = useLocalStorageState<boolean>('vllora-traces-output-tool-calls-collapsed', {
        defaultValue: false,
    });
    const [extraFieldsCollapsed, setExtraFieldsCollapsed] = useLocalStorageState<boolean>('vllora-traces-output-extra-fields-collapsed', {
        defaultValue: false,
    });

    // Extract response data using utility function
    const { messages, finish_reason, tool_calls: responseToolCalls } = extractResponseMessage({
        responseObject: response,
        otherLevelMessages,
    });

    const keys = response && Object.keys(response);
    const tool_calls = responseToolCalls && responseToolCalls.length > 0;
    const choices: any[] = response && response.choices as any[];

    const hideChoices = choices && choices.length === 1;
    let extraDataKeys = keys?.filter((key: string) => key !== 'finish_reason' && key !== 'tool_calls' && key !== 'messages' && key !== 'usage');
    if (hideChoices && extraDataKeys && extraDataKeys.length > 0) {
        extraDataKeys = extraDataKeys?.filter((key: string) => key !== 'choices');
    }

    let extraDataDisplay: any = {}
    if (extraDataKeys && extraDataKeys.length > 0) {
        extraDataKeys.forEach((key: string) => {
            extraDataDisplay[key] = response[key];
        })
    }

    return (
        <>
            <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} onCopy={onCopy} copied={copied} />
            {viewMode === 'raw' ? (
                <JsonViewer data={response} collapsed={10} />
            ) : (
                <>
                    {/* Finish reason */}
                    {finish_reason && (() => {
                        const finishInfo = getFinishReasonInfo(finish_reason);
                        return (
                            <ViewerCollapsibleSection
                                title="Finish Reason"
                                icon={<FlagIcon className="h-3.5 w-3.5 text-zinc-400" />}
                                collapsed={finishReasonCollapsed}
                                onCollapsedChange={setFinishReasonCollapsed}
                            >
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-2 text-xs text-zinc-200">
                                        <div className="flex items-center gap-1">
                                            <span className="font-medium">{finishInfo.label}</span>
                                        </div>
                                    </div>
                                    <p className="text-[11px] leading-relaxed text-zinc-500">
                                        {finishInfo.description}
                                    </p>
                                </div>
                            </ViewerCollapsibleSection>
                        );
                    })()}
                    {/* Messages Section */}
                    {messages && messages.length > 0 && (
                        <MessageViewer
                            messages={messages as any[]}
                            collapsed={messagesCollapsed}
                            onCollapsedChange={setMessagesCollapsed}
                        />
                    )}
                    {/* Tool calls */}
                    {tool_calls && responseToolCalls && responseToolCalls.length > 0 && messages.length !== responseToolCalls.length && (
                        <ToolDefinitionsViewer
                            toolCalls={responseToolCalls}
                            collapsed={toolCallsCollapsed}
                            onCollapsedChange={setToolCallsCollapsed}
                        />
                    )}

                    {/* Additional Parameters Section */}
                    {extraDataKeys && extraDataKeys.length > 0 && (
                        <ViewerCollapsibleSection
                            title="Additional Fields"
                            icon={<CodeBracketIcon className="h-3.5 w-3.5 text-zinc-400" />}
                            collapsed={extraFieldsCollapsed}
                            onCollapsedChange={setExtraFieldsCollapsed}
                        >
                            <JsonViewer data={extraDataDisplay} />
                        </ViewerCollapsibleSection>
                    )}
                </>
            )}
        </>
    );
};
