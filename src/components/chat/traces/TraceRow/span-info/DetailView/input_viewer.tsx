import { CodeBracketIcon } from "@heroicons/react/24/outline";
import { JsonViewer } from "../JsonViewer";
import { HeaderViewer } from "./header-viewer";
import { MessageViewer } from "./message-viewer";
import { ToolDefinitionsViewer } from "./tool-definitions-viewer";
import { ViewerCollapsibleSection } from "./ViewerCollapsibleSection";
import { useState } from "react";
import { useLocalStorageState } from "ahooks";
import { Copy, Check } from "lucide-react";
import { getBackendUrl } from "@/config/api";
import { CodeBlock } from "../../../components/CodeBlock";
import { generateCurlCommand } from "../../../components/TraceCodeView";

export const InputViewer = (props: {
    jsonRequest: any,
    headers?: any,
    viewMode?: 'ui' | 'raw'
}) => {

    const { jsonRequest, headers } = props;
    const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
    const [codeViewMode, setCodeViewMode] = useState<'curl' | 'json'>('curl');
    const [copied, setCopied] = useState(false);
    const [copiedJson, setCopiedJson] = useState(false);
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

    if(!messages && !tools && (!extraDataKeys || extraDataKeys.length === 0)){
        return null;
    }

    const handleCopyCurl = async () => {
        const curlCommand = generateCurlCommand({
            requestObj: jsonRequest,
            headerObj: headers,
            method:'POST',
            fullUrl: `${getBackendUrl()}/v1/chat/completions`,
            showAllHeaders,
        });
        await navigator.clipboard.writeText(curlCommand);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleCopyJson = async () => {
        await navigator.clipboard.writeText(JSON.stringify(jsonRequest, null, 2));
        setCopiedJson(true);
        setTimeout(() => setCopiedJson(false), 2000);
    };

    return (<div className="relative flex flex-col gap-4 rounded-lg border border-border  p-4 pt-6 bg-black">
        <div className="absolute -top-[10px] left-0 right-0 flex justify-center items-center gap-2">
            {hasMessages ? (
                <div className="flex items-center gap-0.5 bg-border rounded">
                    <button
                        onClick={() => setActiveTab('preview')}
                        className={`px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                            activeTab === 'preview'
                                ? 'bg-zinc-700 text-white rounded'
                                : 'text-zinc-400 hover:text-zinc-300'
                        }`}
                    >
                        Input
                    </button>
                    <button
                        onClick={() => setActiveTab('code')}
                        className={`px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                            activeTab === 'code'
                                ? 'bg-zinc-700 text-white rounded'
                                : 'text-zinc-400 hover:text-zinc-300'
                        }`}
                    >
                        Code
                    </button>
                </div>
            ) : (
                <span className="px-2 rounded bg-border text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Input
                </span>
            )}
        </div>
        <div className="flex flex-col gap-6 overflow-y-auto text-xs">
            {activeTab === 'preview' ? (
                <>
                    {headers && (
                        <HeaderViewer
                            headers={headers}
                            showAll={showAllHeaders}
                            onShowAllChange={setShowAllHeaders}
                            collapsed={headersCollapsed}
                            onCollapsedChange={setHeadersCollapsed}
                        />
                    )}
                    {messages && (
                        <MessageViewer
                            messages={messages as any}
                            collapsed={messagesCollapsed}
                            onCollapsedChange={setMessagesCollapsed}
                        />
                    )}

                    {tools && (
                        <ToolDefinitionsViewer
                            toolCalls={tools}
                            tool_choice={tool_choice}
                            collapsed={toolsCollapsed}
                            onCollapsedChange={setToolsCollapsed}
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
            ) : (
                <div className="flex flex-col gap-2 divide-y divide-zinc-800">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-0.5 bg-zinc-800 rounded p-0.5">
                                <button
                                    onClick={() => setCodeViewMode('curl')}
                                    className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors rounded ${
                                        codeViewMode === 'curl'
                                            ? 'bg-zinc-600 text-white'
                                            : 'text-zinc-400 hover:text-zinc-300'
                                    }`}
                                >
                                    cURL
                                </button>
                                <button
                                    onClick={() => setCodeViewMode('json')}
                                    className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors rounded ${
                                        codeViewMode === 'json'
                                            ? 'bg-zinc-600 text-white'
                                            : 'text-zinc-400 hover:text-zinc-300'
                                    }`}
                                >
                                    JSON
                                </button>
                            </div>
                        </div>
                        <button
                            onClick={codeViewMode === 'curl' ? handleCopyCurl : handleCopyJson}
                            className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-zinc-400 hover:text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                        >
                            {(codeViewMode === 'curl' ? copied : copiedJson) ? (
                                <>
                                    <Check className="w-3 h-3 text-green-500" />
                                    <span>Copied!</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                </>
                            )}
                        </button>
                    </div>
                    <div className="pt-2">
                        {codeViewMode === 'curl' ? (
                            <CodeBlock
                                title="cURL"
                                code={generateCurlCommand({
                                    requestObj: jsonRequest,
                                    headerObj: headers,
                                    method: 'POST',
                                    fullUrl: `${getBackendUrl()}/v1/chat/completions`,
                                    showAllHeaders,
                                })}
                                language="bash"
                                hideTitle={true}
                            />
                        ) : (
                            <JsonViewer data={jsonRequest} />
                        )}
                    </div>
                </div>
            )}
        </div>
    </div>
    );
}