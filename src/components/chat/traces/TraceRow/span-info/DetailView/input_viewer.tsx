import { CodeBracketIcon } from "@heroicons/react/24/outline";
import { JsonViewer } from "../JsonViewer";
import { HeaderViewer } from "./header-viewer";
import { MessageViewer } from "./message-viewer";
import { ToolDefinitionsViewer } from "./tool-definitions-viewer";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { getBackendUrl } from "@/config/api";
import { CodeBlock } from "../../../components/CodeBlock";
import { generateCurlCommand } from "../../../components/TraceCodeView";


// Helper function to generate curl command
// const generateCurlCommand = (jsonRequest: any, headers?: any): string => {
//     const endpoint = `${getBackendUrl()}/v1/chat/completions`

//     let curlCommand = `curl ${endpoint} \\\n`;
//     curlCommand += `  -H "Content-Type: application/json" \\\n`;

//     // Add headers if provided
//     if (headers) {

//         const filteredHeaders = Object.entries(headers).filter(h => {
//         const validHeaders = ["x-project-id", 'x-thread-id', 'x-tag', 'x-thread-title', 'content-type', 'authorization', 'Authorization']
//         return validHeaders.includes(h[0].toLowerCase())
//       });
//         filteredHeaders.forEach(([key, value]) => {
//             if (key !== 'x-endpoint' && key.toLowerCase() !== 'content-type') {
//                 curlCommand += `  -H "${key}: ${value}" \\\n`;
//             }
//         });
//     }

//     // Build request body
//     const requestBody: any = { ...jsonRequest };

//     // Convert to JSON string and escape for shell
//     // Using single quotes for the shell, so we need to escape single quotes in the JSON
//     // by ending the quote, adding an escaped single quote, and starting a new quote
//     const jsonString = JSON.stringify(requestBody, null, 2).replace(/'/g, "'\\''");
//     const escapedJson = jsonString

//     curlCommand += `  -d '${escapedJson}'`;

//     return curlCommand;
// };

// Main RequestViewer Component
export const InputViewer = (props: {
    jsonRequest: any,
    headers?: any,
    viewMode?: 'ui' | 'raw'
}) => {

    const { jsonRequest, headers } = props;
    const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
    const [copied, setCopied] = useState(false);
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
        });
        await navigator.clipboard.writeText(curlCommand);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
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
                        <HeaderViewer headers={headers} />
                    )}
                    {messages && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <div className="h-px flex-1 bg-border" />
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                    Messages
                                </div>
                                <span className="text-[10px] font-medium text-zinc-500">
                                    ({messages.length})
                                </span>
                                <div className="h-px flex-1 bg-border" />
                            </div>
                            <MessageViewer
                                messages={messages as any}
                            />
                        </div>
                    )}

                    {tools && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <div className="h-px flex-1 bg-border" />
                                <div className="flex items-center gap-3">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                        Tools
                                    </div>
                                    {tool_choice && (
                                        <div className="text-[10px] font-medium tracking-wide text-zinc-500">
                                            ({tool_choice})
                                        </div>
                                    )}
                                </div>
                                <div className="h-px flex-1 bg-border" />
                            </div>
                            <ToolDefinitionsViewer toolCalls={tools} />
                        </div>
                    )}

                    {/* Additional Parameters Section */}
                    {extraDataKeys && extraDataKeys.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <div className="h-px flex-1 bg-border" />
                                <div className="flex items-center gap-2">
                                    <CodeBracketIcon className="h-3.5 w-3.5 text-zinc-400" />
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                        Additional Fields
                                    </div>
                                </div>
                                <div className="h-px flex-1 bg-border" />
                            </div>
                            <JsonViewer data={extraDataDisplay} />
                        </div>
                    )}
                </>
            ) : (
                <div className="flex flex-col gap-2 divide-y divide-zinc-800">
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                            cURL Command
                        </div>
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
                    <div className="pt-2">
                            <CodeBlock title="cURL" code={generateCurlCommand({
                                requestObj: jsonRequest,
                                headerObj: headers,
                                method: 'POST',
                                fullUrl: `${getBackendUrl()}/v1/chat/completions`,
                            })} language="bash" hideTitle={true} />
                            {/* <code>{generateCurlCommand(jsonRequest, headers)}</code> */}
                    </div>
                </div>
            )}
        </div>
    </div>
    );
}