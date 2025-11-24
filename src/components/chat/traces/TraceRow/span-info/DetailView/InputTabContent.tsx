import { CodeBracketIcon } from "@heroicons/react/24/outline";
import { JsonViewer } from "../JsonViewer";
import { HeaderViewer } from "./header-viewer";
import { MessageViewer } from "./message-viewer";
import { ToolDefinitionsViewer } from "./tool-definitions-viewer";
import { ViewerCollapsibleSection } from "./ViewerCollapsibleSection";

interface InputTabContentProps {
    headers?: any;
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

export const InputTabContent = ({
    headers,
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
}: InputTabContentProps) => {
    return (
        <>
            {headers && (
                <HeaderViewer
                    headers={headers}
                    showAll={showAllHeaders}
                    onShowAllChange={onShowAllHeadersChange}
                    collapsed={headersCollapsed}
                    onCollapsedChange={onHeadersCollapsedChange}
                />
            )}
            {messages && (
                <MessageViewer
                    messages={messages as any}
                    collapsed={messagesCollapsed}
                    onCollapsedChange={onMessagesCollapsedChange}
                />
            )}

            {tools && (
                <ToolDefinitionsViewer
                    toolCalls={tools}
                    tool_choice={tool_choice}
                    collapsed={toolsCollapsed}
                    onCollapsedChange={onToolsCollapsedChange}
                />
            )}

            {/* Additional Parameters Section */}
            {extraDataKeys && extraDataKeys.length > 0 && (
                <ViewerCollapsibleSection
                    title="Additional Fields"
                    icon={<CodeBracketIcon className="h-3.5 w-3.5 text-zinc-400" />}
                    collapsed={extraFieldsCollapsed}
                    onCollapsedChange={onExtraFieldsCollapsedChange}
                >
                    <JsonViewer data={extraDataDisplay} collapsed={extraFieldsCollapsed ? 10 : undefined} />
                </ViewerCollapsibleSection>
            )}
        </>
    );
};
