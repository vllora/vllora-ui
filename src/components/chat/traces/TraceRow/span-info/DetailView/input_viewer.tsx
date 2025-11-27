import { JsonViewer } from "../JsonViewer";
import { InputTabContent } from "./InputTabContent";
import { useState } from "react";
import { useLocalStorageState } from "ahooks";
import { Copy, Check } from "lucide-react";
import { getBackendUrl } from "@/config/api";
import { CodeBlock } from "../../../components/CodeBlock";
import { generateCurlCommand } from "../../../components/TraceCodeView";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

export const InputViewer = (props: {
    jsonRequest: any,
    headers?: any,
    viewMode?: 'ui' | 'raw',
    headerAction?: React.ReactNode,
}) => {

    const { jsonRequest, headers, headerAction } = props;
    const [activeTab, setActiveTab] = useState<'input' | 'json' | 'code'>('input');
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
                <TooltipProvider>
                    <div className="flex items-center gap-0.5 bg-border rounded">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => setActiveTab('input')}
                                    className={`px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                                        activeTab === 'input'
                                            ? 'bg-zinc-700 text-white rounded'
                                            : 'text-zinc-400 hover:text-zinc-300'
                                    }`}
                                >
                                    Input
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                <p className="text-xs">Formatted view of messages and parameters</p>
                            </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => setActiveTab('json')}
                                    className={`px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                                        activeTab === 'json'
                                            ? 'bg-zinc-700 text-white rounded'
                                            : 'text-zinc-400 hover:text-zinc-300'
                                    }`}
                                >
                                    Json
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                <p className="text-xs">Raw JSON request payload</p>
                            </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
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
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                <p className="text-xs">cURL command to replay this request</p>
                            </TooltipContent>
                        </Tooltip>
                        {headerAction}
                    </div>
                </TooltipProvider>
            ) : (
                <span className="px-2 rounded bg-border text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Input
                </span>
            )}
        </div>
        <div className="flex flex-col gap-6 overflow-y-auto text-xs">
            {activeTab === 'input' ? (
                <InputTabContent
                    headers={headers}
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
            ) : activeTab === 'json' ? (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-end">
                        <button
                            onClick={handleCopyJson}
                            className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-zinc-400 hover:text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                        >
                            {copiedJson ? (
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
                    <JsonViewer data={jsonRequest} collapsed={10} />
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-end">
                        <button
                            onClick={handleCopyCurl}
                            className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-zinc-400 hover:text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                        >
                            {copied ? (
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
                </div>
            )}
        </div>
    </div>
    );
}