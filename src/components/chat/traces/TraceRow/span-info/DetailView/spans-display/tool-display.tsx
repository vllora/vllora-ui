import { BaseSpanUIDetailsDisplay, getParentApiInvoke } from "..";
import { ToolCallsViewer } from "../tool-calls-viewer";
import { ArrowTopRightOnSquareIcon, BoltIcon, CheckCircleIcon, DocumentTextIcon, ExclamationTriangleIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { ToolDefinitionsViewer } from "../tool-definitions-viewer";
import { BasicSpanInfo } from "../basic-span-info-section";
import { JsonViewer } from "../../JsonViewer";
import { ServerIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { tryParseJson } from "@/utils/modelUtils";
import { Span, ToolCall } from "@/types/common-type";
import { cn } from "@/lib/utils";
export interface ToolInfoCall {
    type: string;
    id?: string;
    function: {
        name: string;
        description: string;
        parameters: Record<string, any>;
        arguments?: any;
    }
}
export const ToolUIDetailsDisplay = ({ span }: { span: Span }) => {
    const { spansOfSelectedRun } = ChatWindowConsumer();

    const currentSpan = span;
    const attributeTool = currentSpan.attribute as ToolCall;
    const toolCalls = attributeTool.tool_calls;
    const labelTitles: string[] = attributeTool.label && attributeTool.label.split(',') || [];
    const jsonToolCalls: any[] | undefined = toolCalls && tryParseJson(toolCalls);
    const toolCallCount = jsonToolCalls?.length || 0;
    const parentApiInvoke = getParentApiInvoke(spansOfSelectedRun, currentSpan.span_id);
    const parentApiInvokeAttribute = parentApiInvoke?.attribute as any;
    const requestParentApiInvokeStr = parentApiInvokeAttribute?.request;
    const requestParentApiInvoke = requestParentApiInvokeStr && tryParseJson(requestParentApiInvokeStr);
    const tools: ToolInfoCall[] = requestParentApiInvoke?.tools || [];
    const currentToolsInfo = tools.filter((t: ToolInfoCall) => labelTitles.includes(t['function'].name));

    const isSuccess = !attributeTool.error;
    const toolResponse = attributeTool.response;
    const toolResult = attributeTool.tool_results;
    const mcp_server_string = attributeTool.mcp_server;
    const mcp_server_json: {
        name: string;
        slug: string;
        description: string;
        created_at: string;
        updated_at: string;
    } | undefined = mcp_server_string && tryParseJson(mcp_server_string);

    const toolResponseJson = toolResponse ? tryParseJson(toolResponse) as {
        content: {
            text: string;
            type: string;
        }[];
        isError: boolean;
    } : undefined;
    const toolResultJson = toolResult ? tryParseJson(toolResult) as any : undefined;

    return (
        <BaseSpanUIDetailsDisplay>
            <div className="flex flex-col gap-2 p-3 border-b border-border rounded-t-md">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BoltIcon className="h-3.5 w-3.5 text-white" />
                        <span className="text-xs text-white">Status</span>
                    </div>

                    <div className={`flex items-center px-2 py-1 rounded-md text-xs ${isSuccess ? 'bg-[#1a2e1a] text-green-500 border border-green-800' : 'bg-[#2e1a1a] text-red-500 border border-red-800'}`}>
                        {isSuccess ? (
                            <CheckCircleIcon className="w-3 h-3 mr-1" />
                        ) : (
                            <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
                        )}
                        {isSuccess ? "Success" : "Failed"}
                    </div>
                </div>


            </div>
            {/* ID information section */}
            <BasicSpanInfo span={span} />
            {/* MCP Info section */}
            {mcp_server_json && (
                <a
                    className="flex flex-col gap-2 hover:underline"
                    >
                    <div className="flex items-center justify-between w-full px-3 py-2 border-border border-b">
                        <div className="flex items-center gap-2">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="flex items-center gap-2 cursor-help">
                                            <ServerIcon className="w-4 h-4 text-emerald-500" />
                                            <span className="font-medium text-xs text-white">MCP Server</span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="bg-[#1a1a1a] border-border text-white">
                                        <p className="text-xs max-w-[250px]">Model Context Protocol (MCP) Server that processed this tool call. Click to view server details.</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        <div className="flex items-center gap-2">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="text-xs text-white bg-[#1a1a1a] px-2 py-0.5 rounded-md cursor-help">
                                            {mcp_server_json.name}
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="bg-[#1a1a1a] border-border text-white">
                                        <div className="text-xs max-w-[250px]">
                                            <p className="font-medium">{mcp_server_json.name}</p>
                                            <p className="text-gray-400 mt-1">{mcp_server_json.description}</p>
                                            <p className="text-gray-400 mt-1">Created: {new Date(mcp_server_json.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <ArrowTopRightOnSquareIcon className="w-4 h-4 text-white" />
                        </div>
                    </div>
                </a>
            )}
            {/* Tool Info section */}
            {currentToolsInfo && currentToolsInfo.length > 0 && (<div className="flex flex-col gap-2 border-b border-border">
                <div className="flex items-center justify-between w-full px-3 py-2 border-border border-b">
                    <div className="flex items-center gap-2">
                        <WrenchScrewdriverIcon className="w-4 h-4 text-blue-500" />
                        <span className="font-medium text-xs text-white">Definitions</span>
                    </div>
                    <span className="text-xs text-gray-400 bg-[#1a1a1a] px-2 py-0.5 rounded-md">
                        {currentToolsInfo.length}
                    </span>
                </div>
                <div className="px-2 mb-2">
                    <ToolDefinitionsViewer toolCalls={currentToolsInfo} />
                </div>
            </div>)}
            {/* Tool Calls section */}
            {jsonToolCalls && jsonToolCalls.length > 0 && (<div className="flex flex-col gap-2 border-b border-border">
                <div className="flex items-center justify-between w-full px-3 py-2 border-border border-b">
                    <div className="flex items-center gap-2">
                        <WrenchScrewdriverIcon className="w-4 h-4 text-amber-500" />
                        <span className="font-medium text-xs text-white">Execution</span>
                    </div>
                    {toolCallCount && <span className="text-xs text-gray-400 bg-[#1a1a1a] px-2 py-0.5 rounded-md">
                        {toolCallCount}
                    </span>}
                </div>
                <div className="px-2 mb-2">
                    <ToolCallsViewer input={jsonToolCalls} />
                </div>
            </div>)}
            {attributeTool && attributeTool.error && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 p-2 px-2">
                        <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />
                        <span className="font-medium text-xs text-white">Error</span>
                    </div>
                    <div className="bg-[#0a0a0a] rounded-md p-3 border border-border">
                        <span className="text-xs text-muted-foreground">{attributeTool.error}</span>
                    </div>
                </div>
            )}
            {toolResponseJson && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 p-2 px-2">
                        <DocumentTextIcon className="w-4 h-4 text-blue-500" />
                        <span className="font-medium text-xs text-white">Response</span>
                    </div>
                    <div className="px-2">
                        {toolResponseJson.content ? (
                            <div className="bg-[#0a0a0a] rounded-md p-3 border border-border">
                                {toolResponseJson.content.map((item: { text: string; type: string }, index: number) => {
                                    // try parse json
                                    const parsed = tryParseJson(item.text);
                                    if (parsed) {
                                        return (
                                            <JsonViewer
                                                data={parsed}
                                                style={{
                                                    fontSize: '10px',
                                                }}
                                            />
                                        );
                                    }
                                    return (
                                        <pre
                                            key={`${index}-${item.text.substring(0, 20)}`}
                                            className={cn(
                                                'mb-1 last:mb-0 whitespace-pre-wrap text-wrap',
                                                item.type === 'text' ? 'text-white' : 'text-red-500',
                                                'text-xs leading-relaxed'
                                            )}
                                        >
                                            {item.text}
                                        </pre>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="bg-[#0a0a0a] rounded-md p-3 border border-border">
                                <span className="text-xs text-gray-400">No content in response</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {toolResultJson || toolResult ? (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between w-full px-3 py-2 border-border border-b">
                        <div className="flex items-center gap-2">
                            <DocumentTextIcon className="w-4 h-4 text-blue-500" />
                            <span className="font-medium text-xs text-white">Response</span>
                        </div>
                        {toolResultJson && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger>
                                        <Badge
                                            className="text-xs text-white bg-[#1a1a1a] px-2 py-0.5 rounded-md cursor-help"
                                        >
                                            JSON
                                        </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="bg-[#1a1a1a] border-border text-white">
                                        <p className="text-xs max-w-[250px]">Response formatted as JSON</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </div>

                    {toolResultJson ? (
                        <div className="bg-[#0a0a0a] border border-border rounded-md overflow-hidden">
                            <JsonViewer
                                data={toolResultJson}
                                style={{
                                    fontSize: '11px',
                                    padding: '12px',
                                    backgroundColor: '#0a0a0a',
                                }}
                            />
                        </div>
                    ) : (
                        <div className="bg-[#0a0a0a] border border-border rounded-md p-3 overflow-auto max-h-[300px]">
                            
                            <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono">{toolResult}</pre>
                        </div>
                    )}
                </div>
            ) : null}
        </BaseSpanUIDetailsDisplay>
    );
}
