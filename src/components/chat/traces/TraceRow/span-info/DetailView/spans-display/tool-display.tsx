import { BaseSpanUIDetailsDisplay } from "..";
import { ToolCallsViewer } from "../tool-calls-viewer";
import { ArrowTopRightOnSquareIcon, DocumentTextIcon, ExclamationTriangleIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { JsonViewer } from "../../JsonViewer";
import { ServerIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { tryParseJson } from "@/utils/modelUtils";
import { Span, ToolCall } from "@/types/common-type";
import { cn } from "@/lib/utils";
import { getExecuteMessagesResult } from "../../../new-timeline/utils";

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

interface ToolUIDetailsDisplayProps {
    span: Span;
    relatedSpans?: Span[];
}



export const ToolUIDetailsDisplay = ({ span, relatedSpans = [] }: ToolUIDetailsDisplayProps) => {
    const currentSpan = span;
    const attributeTool = currentSpan.attribute as ToolCall;
    const toolCalls = attributeTool.tool_calls;
    const jsonToolCalls: any[] | undefined = toolCalls && tryParseJson(toolCalls);
    const toolExecutionIds: string[] = jsonToolCalls?.map((toolCall: any) => toolCall.id) || [];

    // Use the extracted function to get execution messages result
    const executeMessagesResult = getExecuteMessagesResult(
        toolExecutionIds,
        relatedSpans,
        currentSpan.span_id
    );

    const toolCallCount = jsonToolCalls?.length || 0;
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
            <div className="flex flex-col gap-6">
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
            {/* {currentToolsInfo && currentToolsInfo.length > 0 && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border/40" />
                        <div className="flex items-center gap-2">
                            <WrenchScrewdriverIcon className="h-3.5 w-3.5 text-zinc-400" />
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                Definitions
                            </div>
                            <span className="text-[10px] font-medium text-zinc-500">
                                ({currentToolsInfo.length})
                            </span>
                        </div>
                        <div className="h-px flex-1 bg-border/40" />
                    </div>
                    <ToolDefinitionsViewer toolCalls={currentToolsInfo} />
                </div>
            )} */}
            {/* Tool Calls section */}
            {jsonToolCalls && jsonToolCalls.length > 0 && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border/40" />
                        <div className="flex items-center gap-2">
                            <WrenchScrewdriverIcon className="h-3.5 w-3.5 text-zinc-400" />
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                Execution
                            </div>
                            {toolCallCount > 0 && (
                                <span className="text-[10px] font-medium text-zinc-500">
                                    ({toolCallCount})
                                </span>
                            )}
                        </div>
                        <div className="h-px flex-1 bg-border/40" />
                    </div>
                    <ToolCallsViewer input={jsonToolCalls} executeMessagesResult={executeMessagesResult} />
                </div>
            )}
            {attributeTool && attributeTool.error && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border/40" />
                        <div className="flex items-center gap-2">
                            <ExclamationTriangleIcon className="h-3.5 w-3.5 text-red-400" />
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                Error
                            </div>
                        </div>
                        <div className="h-px flex-1 bg-border/40" />
                    </div>
                    <div className="rounded-md p-3 border border-border/40">
                        <span className="text-xs text-muted-foreground">{attributeTool.error}</span>
                    </div>
                </div>
            )}
            {toolResponseJson && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border/40" />
                        <div className="flex items-center gap-2">
                            <DocumentTextIcon className="h-3.5 w-3.5 text-zinc-400" />
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                Response
                            </div>
                        </div>
                        <div className="h-px flex-1 bg-border/40" />
                    </div>
                    {toolResponseJson.content ? (
                        <div className="rounded-md p-3 border border-border/40">
                            {toolResponseJson.content.map((item: { text: string; type: string }, index: number) => {
                                // try parse json
                                const parsed = tryParseJson(item.text);
                                if (parsed) {
                                    return (
                                        <JsonViewer
                                            key={index}
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
                        <div className="rounded-md p-3 border border-border/40">
                            <span className="text-xs text-gray-400">No content in response</span>
                        </div>
                    )}
                </div>
            )}
            {toolResultJson || toolResult ? (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border/40" />
                        <div className="flex items-center gap-2">
                            <DocumentTextIcon className="h-3.5 w-3.5 text-zinc-400" />
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                Response
                            </div>
                            {toolResultJson && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Badge className="text-[10px] text-zinc-400 bg-transparent border border-border/40 px-1.5 py-0 rounded cursor-help">
                                                JSON
                                            </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent side="left" className="bg-background border-border">
                                            <p className="text-xs max-w-[250px]">Response formatted as JSON</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                        </div>
                        <div className="h-px flex-1 bg-border/40" />
                    </div>

                    {toolResultJson ? (
                        <div className="border border-border/40 rounded-md overflow-hidden">
                            <JsonViewer
                                data={toolResultJson}
                                style={{
                                    fontSize: '11px',
                                    padding: '12px',
                                }}
                            />
                        </div>
                    ) : (
                        <div className="border border-border/40 rounded-md p-3 overflow-auto max-h-[300px]">
                            <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono">{toolResult}</pre>
                        </div>
                    )}
                </div>
            ) : null}
            </div>
        </BaseSpanUIDetailsDisplay>
    );
}
