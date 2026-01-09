import { JsonViewer } from "../JsonViewer";
import { InputTabContent } from "./InputTabContent";
import { ViewModeToggle, ViewMode } from "./view-mode-toggle";

interface InputTabContentWrapperProps {
    jsonRequest: any;
    headers?: any;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    onCopy: () => void;
    copied: boolean;
    showAllHeaders?: boolean;
    onShowAllHeadersChange?: (show: boolean) => void;
    headersCollapsed?: boolean;
    onHeadersCollapsedChange?: (collapsed: boolean) => void;
    messages?: any;
    messagesCollapsed?: boolean;
    onMessagesCollapsedChange?: (collapsed: boolean) => void;
    tools?: any;
    tool_choice?: any;
    toolsCollapsed?: boolean;
    onToolsCollapsedChange?: (collapsed: boolean) => void;
    extraDataKeys?: string[];
    extraDataDisplay?: any;
    extraFieldsCollapsed?: boolean;
    onExtraFieldsCollapsedChange?: (collapsed: boolean) => void;
}

export const InputTabContentWrapper = ({
    jsonRequest,
    headers,
    viewMode,
    onViewModeChange,
    onCopy,
    copied,
    showAllHeaders,
    onShowAllHeadersChange,
    headersCollapsed,
    onHeadersCollapsedChange,
    messages,
    messagesCollapsed,
    onMessagesCollapsedChange,
    tools,
    tool_choice,
    toolsCollapsed,
    onToolsCollapsedChange,
    extraDataKeys,
    extraDataDisplay,
    extraFieldsCollapsed,
    onExtraFieldsCollapsedChange,
}: InputTabContentWrapperProps) => {
    return (
        <>
            <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} onCopy={onCopy} copied={copied} />
            {viewMode === 'raw' ? (
                <JsonViewer data={jsonRequest} collapsed={10} />
            ) : (
                <InputTabContent
                    headers={headers}
                    showAllHeaders={showAllHeaders}
                    onShowAllHeadersChange={onShowAllHeadersChange}
                    headersCollapsed={headersCollapsed}
                    onHeadersCollapsedChange={onHeadersCollapsedChange}
                    messages={messages}
                    messagesCollapsed={messagesCollapsed}
                    onMessagesCollapsedChange={onMessagesCollapsedChange}
                    tools={tools}
                    tool_choice={tool_choice}
                    toolsCollapsed={toolsCollapsed}
                    onToolsCollapsedChange={onToolsCollapsedChange}
                    extraDataKeys={extraDataKeys}
                    extraDataDisplay={extraDataDisplay}
                    extraFieldsCollapsed={extraFieldsCollapsed}
                    onExtraFieldsCollapsedChange={onExtraFieldsCollapsedChange}
                />
            )}
        </>
    );
};
