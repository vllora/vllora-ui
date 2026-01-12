import { useState } from "react";
import { useLocalStorageState } from "ahooks";
import { hasExtractableResponse } from "@/utils/extractResponseMessage";
import { Span } from "@/types/common-type";
import { StatsBar } from "./stats-bar";
import { ViewMode } from "./view-mode-toggle";
import { OutputTabContent } from "./output-tab-content";
import { InputTabContentWrapper } from "./input-tab-content-wrapper";
import { MetadataTabContent } from "./metadata-tab-content";

type TabType = 'input' | 'output' | 'metadata';

export interface RequestResponseViewerProps {
    jsonRequest?: any;
    response?: any;
    headers?: any;
    otherLevelMessages?: string[];
    headerAction?: React.ReactNode;
    span?: Span;
    // Usage stats
    latency?: string;
    startTime?: number;
    endTime?: number;
    usage?: {
        total_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
        input_tokens?: number;
        output_tokens?: number;
    };
    costInfo?: number | { total_cost?: number };
}

export const RequestResponseViewer = (props: RequestResponseViewerProps) => {
    const { jsonRequest, response, headers, otherLevelMessages, headerAction, span, latency, startTime, endTime, costInfo, usage } = props;

    // Calculate cost from props
    const totalCost = typeof costInfo === 'number' ? costInfo : costInfo?.total_cost;

    // Determine which tabs are available
    const hasRequest = !!jsonRequest;
    const hasResponse = response && hasExtractableResponse(response);

    // Default to input if available, otherwise output
    const defaultTab: TabType = hasRequest ? 'input' : 'output';
    const [activeTab, setActiveTab] = useState<TabType>(defaultTab);

    // View mode states for each tab
    const [inputViewMode, setInputViewMode] = useState<ViewMode>('ui');
    const [outputViewMode, setOutputViewMode] = useState<ViewMode>('ui');

    const [copiedInput, setCopiedInput] = useState(false);
    const [copiedOutput, setCopiedOutput] = useState(false);

    // Input tab state
    const [showAllHeaders, setShowAllHeaders] = useLocalStorageState<boolean>('vllora-traces-show-all-headers', {
        defaultValue: false,
    });
    const [headersCollapsed, setHeadersCollapsed] = useLocalStorageState<boolean>('vllora-traces-input-headers-collapsed', {
        defaultValue: false,
    });
    const [messagesCollapsed, setMessagesCollapsed] = useLocalStorageState<boolean>('vllora-traces-input-messages-collapsed', {
        defaultValue: false,
    });
    const [toolsCollapsed, setToolsCollapsed] = useLocalStorageState<boolean>('vllora-traces-input-tools-collapsed', {
        defaultValue: false,
    });
    const [extraFieldsCollapsed, setExtraFieldsCollapsed] = useLocalStorageState<boolean>('vllora-traces-input-extra-fields-collapsed', {
        defaultValue: false,
    });

    // Parse input data
    let messages = jsonRequest?.messages;
    if (!messages && jsonRequest?.contents) {
        messages = jsonRequest?.contents;
    }
    const tools = jsonRequest?.tools;
    const keys = jsonRequest && Object.keys(jsonRequest);
    let extraDataKeys = keys?.filter((key: string) => !['messages', 'tools', 'tool_choice', 'model'].includes(key));
    let extraDataDisplay: any = {}
    if (extraDataKeys && extraDataKeys.length > 0) {
        extraDataKeys.forEach((key: string) => {
            extraDataDisplay[key] = jsonRequest[key];
        })
    }
    const tool_choice = jsonRequest?.tool_choice;
    const hasMessages = !!messages;

    // If no data at all, return null
    if (!hasRequest && !hasResponse) {
        return null;
    }

    const handleCopyInput = async () => {
        await navigator.clipboard.writeText(JSON.stringify(jsonRequest, null, 2));
        setCopiedInput(true);
        setTimeout(() => setCopiedInput(false), 2000);
    };

    const handleCopyOutput = async () => {
        await navigator.clipboard.writeText(JSON.stringify(response, null, 2));
        setCopiedOutput(true);
        setTimeout(() => setCopiedOutput(false), 2000);
    };

    // Build available tabs
    const availableTabs: { key: TabType; label: string }[] = [];
    if (hasRequest && hasMessages) {
        availableTabs.push({ key: 'input', label: 'Input' });
    }
    if (hasResponse) {
        availableTabs.push({ key: 'output', label: 'Output' });
    }
    if (span) {
        availableTabs.push({ key: 'metadata', label: 'Metadata' });
    }

    return (
        <div className="flex flex-col rounded-lg">
            {/* Stats Bar */}
            <div className="p-2 pb-0">
                <StatsBar latency={latency} startTime={startTime} endTime={endTime} usage={usage} cost={totalCost} />
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-0 border-b border-border px-4">
                {availableTabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-3 text-xs font-medium uppercase tracking-wider transition-colors border-b-2 -mb-[1px] ${
                            activeTab === tab.key
                                ? 'text-[rgb(var(--theme-500))] border-[rgb(var(--theme-500))]'
                                : 'text-zinc-500 border-transparent hover:text-zinc-300'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
                {headerAction && (
                    <div className="ml-auto">
                        {headerAction}
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex flex-col gap-2 p-4 overflow-y-auto text-xs">
                {activeTab === 'input' && hasRequest && (
                    <InputTabContentWrapper
                        jsonRequest={jsonRequest}
                        headers={headers}
                        viewMode={inputViewMode}
                        onViewModeChange={setInputViewMode}
                        onCopy={handleCopyInput}
                        copied={copiedInput}
                        showAllHeaders={showAllHeaders}
                        onShowAllHeadersChange={setShowAllHeaders}
                        headersCollapsed={headersCollapsed}
                        onHeadersCollapsedChange={setHeadersCollapsed}
                        messages={messages}
                        messagesCollapsed={messagesCollapsed}
                        onMessagesCollapsedChange={setMessagesCollapsed}
                        tools={tools}
                        tool_choice={tool_choice}
                        toolsCollapsed={toolsCollapsed}
                        onToolsCollapsedChange={setToolsCollapsed}
                        extraDataKeys={extraDataKeys}
                        extraDataDisplay={extraDataDisplay}
                        extraFieldsCollapsed={extraFieldsCollapsed}
                        onExtraFieldsCollapsedChange={setExtraFieldsCollapsed}
                    />
                )}
                {activeTab === 'output' && hasResponse && (
                    <OutputTabContent
                        response={response}
                        otherLevelMessages={otherLevelMessages}
                        viewMode={outputViewMode}
                        onViewModeChange={setOutputViewMode}
                        onCopy={handleCopyOutput}
                        copied={copiedOutput}
                    />
                )}
                {activeTab === 'metadata' && span && (
                    <MetadataTabContent span={span} />
                )}
            </div>
        </div>
    );
};
