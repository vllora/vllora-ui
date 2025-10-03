import { Span } from "@/types/common-type";
import { BaseSpanUIDetailsDisplay, getApiInvokeSpans, getModelCallSpans, getApiCloudInvokeSpans, getParentApiInvoke, getParentCloudApiInvoke } from ".."
import { getStatus } from "../index";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ExclamationTriangleIcon, CheckCircleIcon, ClockIcon, CpuChipIcon, CodeBracketIcon, ChatBubbleLeftRightIcon, DocumentTextIcon, WrenchScrewdriverIcon, BoltIcon } from "@heroicons/react/24/outline";
import { ErrorViewer } from "../error-viewer";
import { UsageViewer } from "../usage-viewer";
import { OutputViewer } from "../output-viewer";
import { ExtraParameters } from "../input-viewer";
import { MessageViewer } from "../message-viewer";
import { HeadersViewer } from "../headers-viewer";
import { tryParseJson } from "@/utils/modelUtils";
import { ProviderIcon } from "@/components/Icons/ProviderIcons";
import { ToolInfoCall } from "./tool-display";
import { ToolDefinitionsViewer } from "../tool-definitions-viewer";
import { BasicSpanInfo } from "../basic-span-info-section";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
export const CloudApiInvokeUIDetailsDisplay = ({ span }: { span: Span }) => {
    const { spansOfSelectedRun } = ChatWindowConsumer();
    const status = getStatus(spansOfSelectedRun, span.span_id);
    const apiInvokeSpan = span
    const modelCallSpan = span
    const currentAttribute = span.attribute as any;
    const modelCallAttribute = modelCallSpan?.attribute as any;
    const apiInvokeAttribute = apiInvokeSpan?.attribute as any;
    const apiCloudInvokeAttribute = span?.attribute as any;
    const headersStr = apiCloudInvokeAttribute?.['http.request.header'];
    const headers = headersStr ? tryParseJson(headersStr) : undefined;
    const error = modelCallAttribute?.error || apiInvokeAttribute?.error;
    const output = modelCallAttribute?.response || modelCallAttribute?.output || apiInvokeAttribute?.response;
    const request = apiInvokeAttribute?.request;
    const cost_str = apiInvokeAttribute?.cost;
    const ttf_str = modelCallAttribute?.ttft;
    const usage_str = currentAttribute?.usage;
    const modelJsonStr = apiInvokeAttribute?.model || modelCallAttribute?.model;
    const modelJson = modelJsonStr ? tryParseJson(modelJsonStr) : null;
    const modelName = modelJson?.name;

    const entityByName = undefined


    const costInfo = cost_str ? tryParseJson(cost_str) : null;
    const usageInfo = usage_str ? tryParseJson(usage_str) : null;
    const inputInfo = request ? tryParseJson(request) : null;

    const triggerClassName = "px-3 py-3 hover:bg-[#1a1a1a] transition-colors";
    const keys = inputInfo && Object.keys(inputInfo);
    const hasExtraParameters = keys && keys.filter((key: string) => key !== 'messages' && key !== 'tools').length > 0;
    const messageCount = inputInfo?.messages?.length || 0;
    const parameterCount = keys?.filter((key: string) => key !== 'messages' && key !== 'tools').length || 0;

    const headerCount = headers ? Object.keys(headers).length : 0;
    const toolDefinitions: ToolInfoCall[] = inputInfo?.tools || [];

    return (
        <BaseSpanUIDetailsDisplay>
            {/* Header section with model info and status */}
            <div className="flex flex-col gap-2 p-3 border-b border-border rounded-t-md">
                <div className="flex items-center justify-between">
                    {modelName && !entityByName && (
                        <div className="flex items-center gap-2">
                            <CpuChipIcon className="w-4 h-4 text-teal-500" />
                            <span className="text-sm font-medium text-white">{modelName}</span>
                        </div>
                    )}
                    {/* {entityByName && (entityByName as ModelPricing).inference_provider && (
                        <div className="flex items-center gap-2">
                            <ProviderIcon className="w-4 h-4 text-teal-500" provider_name={(entityByName as ModelPricing).inference_provider.provider} />
                            <span className="text-sm font-medium text-white">{(entityByName as ModelPricing).model}</span>
                        </div>
                    )}
                    {entityByName && (entityByName as LLMRouter).strategy && (
                        <div className="flex items-center gap-2">
                            <ProviderIcon className="w-4 h-4 text-teal-500" provider_name={'routers'} />
                            <span className="text-sm font-medium text-white">{(entityByName as LLMRouter).name}</span>
                        </div>
                    )} */}
                   {status && <div className="flex items-center gap-2 w-full justify-between">
                        <div className="flex items-center gap-2">
                            <BoltIcon className="h-3.5 w-3.5 text-white" />
                            <span className="text-xs text-white">Status</span>
                        </div>
                        {status && (
                            <div className={`flex items-center px-2 py-1 rounded-md text-xs ${status === '200' ? 'bg-[#1a2e1a] text-green-500 border border-green-800' : 'bg-[#2e1a1a] text-red-500 border border-red-800'}`}>
                                {status === '200' ? (
                                    <CheckCircleIcon className="w-3 h-3 mr-1" />
                                ) : (
                                    <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
                                )}
                                {status}
                            </div>
                        )}
                    </div>}

                </div>

            </div>
            {/* ID information section */}
            <BasicSpanInfo span={span} />

            {/* Error section - only shown when there's an error */}
            {error && (
                <AccordionItem value="error">
                    <AccordionTrigger className={triggerClassName}>
                        <div className="flex items-center gap-2">
                            <ExclamationTriangleIcon className="w-4 h-4 text-yellow-500" />
                            <span className="font-medium text-xs text-white">Error</span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="bg-[#0a0a0a] border-t border-border p-2">
                        <ErrorViewer error={error} />
                    </AccordionContent>
                </AccordionItem>
            )}
            {/* Headers section */}
            {headers && (
                <AccordionItem value="headers">
                    <AccordionTrigger className={triggerClassName}>
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <CodeBracketIcon className="w-4 h-4 text-blue-500" />
                                <span className="font-medium text-xs text-white">Headers</span>
                            </div>
                            {headerCount && <span className="text-xs text-gray-400 bg-[#1a1a1a] px-2 py-0.5 rounded-md">
                                {headerCount}
                            </span>}
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-2 bg-[#0a0a0a] border-t border-border">
                        <HeadersViewer input={headers} />
                    </AccordionContent>
                </AccordionItem>
            )}

            {/* Messages section */}
            {inputInfo && inputInfo.messages && (
                <AccordionItem value="input">
                    <AccordionTrigger className={triggerClassName}>
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <ChatBubbleLeftRightIcon className="w-4 h-4 text-violet-500" />
                                <span className="font-medium text-xs text-white">Messages</span>
                            </div>
                            {messageCount && <span className="text-xs text-gray-400 bg-[#1a1a1a] px-2 py-0.5 rounded-md">
                                {messageCount}
                            </span>}
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="overflow-y-auto bg-[#0a0a0a] border-t border-border p-2">
                        <MessageViewer messages={inputInfo.messages} />
                    </AccordionContent>
                </AccordionItem>
            )}
            {toolDefinitions && toolDefinitions.length > 0 && (
                <AccordionItem value="tools">
                    <AccordionTrigger className={triggerClassName}>
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <WrenchScrewdriverIcon className="w-4 h-4 text-blue-500" />
                                <span className="font-medium text-xs text-white">Tools Definitions</span>
                            </div>
                            <span className="text-xs text-gray-400 bg-[#1a1a1a] px-2 py-0.5 rounded-md">
                                {toolDefinitions.length}
                            </span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="overflow-y-auto bg-[#0a0a0a] border-t border-border p-2">
                        <ToolDefinitionsViewer toolCalls={toolDefinitions} />
                    </AccordionContent>
                </AccordionItem>
            )}

            {/* Additional Parameters section */}
            {inputInfo && hasExtraParameters && (
                <AccordionItem value="extra-parameters">
                    <AccordionTrigger className={triggerClassName}>
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <CodeBracketIcon className="w-4 h-4 text-amber-500" />
                                <span className="font-medium text-xs text-white">Additional Parameters</span>
                            </div>
                            <span className="text-xs text-gray-400 bg-[#1a1a1a] px-2 py-0.5 rounded-md">
                                {parameterCount}
                            </span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="bg-[#0a0a0a] border-t border-border p-2">
                        <ExtraParameters input={inputInfo} />
                    </AccordionContent>
                </AccordionItem>
            )}

            {/* Output section */}
            {output && (
                <AccordionItem value="output">
                    <AccordionTrigger className={triggerClassName}>
                        <div className="flex items-center gap-2">
                            <DocumentTextIcon className="w-4 h-4 text-green-500" />
                            <span className="font-medium text-xs text-white">Output</span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="bg-[#0a0a0a] border-t border-border p-2">
                        <OutputViewer response_str={output} />
                    </AccordionContent>
                </AccordionItem>
            )}

            {/* Usage section */}
            {costInfo && <AccordionItem value="usage">
                <AccordionTrigger className={triggerClassName}>
                    <div className="flex items-center gap-2">
                        <ClockIcon className="w-4 h-4 text-teal-500" />
                        <span className="font-medium text-xs text-white">Usage & Cost</span>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="border-t border-border p-2">
                    <UsageViewer
                        cost={costInfo || undefined}
                        ttft={ttf_str || undefined}
                        usage={usageInfo || undefined}
                    />
                </AccordionContent>
            </AccordionItem>}


        </BaseSpanUIDetailsDisplay>
    );
}