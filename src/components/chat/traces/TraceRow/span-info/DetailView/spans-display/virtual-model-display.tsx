import { BaseSpanUIDetailsDisplay, getParentApiInvoke, getParentCloudApiInvoke } from ".."
import { getStatus } from "../index";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ExclamationTriangleIcon, CheckCircleIcon, ClockIcon, CpuChipIcon, CodeBracketIcon, ChatBubbleLeftRightIcon, DocumentTextIcon, WrenchScrewdriverIcon, BoltIcon } from "@heroicons/react/24/outline";
import { ErrorViewer } from "../error-viewer";
import { UsageViewer } from "../usage-viewer";
import { OutputViewer } from "../output-viewer";
import { ExtraParameters } from "../input-viewer";
import { MessageViewer } from "../message-viewer";
import { HeadersViewer } from "../headers-viewer";
import { ProviderIcon } from "@/components/Icons/ProviderIcons";
import { IdDisplay } from "./span-id-display";
import { ToolInfoCall } from "./tool-display";
import { ToolDefinitionsViewer } from "../tool-definitions-viewer";
import { BasicSpanInfo } from "../basic-span-info-section";
import { RequestViewer } from "../request-viewer";
import { SimpleTabsList, SimpleTabsTrigger, Tabs } from "@/components/ui/tabs";
import { useState } from "react";
import { ArrowRightLeftIcon } from "lucide-react";
import { ResponseViewer } from "../response-viewer";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { Span } from "@/types/common-type";
import { tryParseJson } from "@/utils/modelUtils";
export const VirtualModelCallUIDetailsDisplay = ({ span }: { span: Span }) => {
    const { spansOfSelectedRun } = ChatWindowConsumer();
    const status = getStatus(spansOfSelectedRun, span.span_id);
    const apiCloudInvokeSpan = getParentCloudApiInvoke(spansOfSelectedRun, span.span_id);
    const apiInvokeSpan = getParentApiInvoke(spansOfSelectedRun, span.span_id);
    const modelCallSpan = span
    const modelCallAttribute = modelCallSpan?.attribute as any;
    const apiInvokeAttribute = apiInvokeSpan?.attribute as any;
    const apiCloudInvokeAttribute = apiCloudInvokeSpan?.attribute as any;
    const headersStr = apiCloudInvokeAttribute?.['http.request.header'];
    const headers = headersStr ? tryParseJson(headersStr) : undefined;
    const error = modelCallAttribute?.error || apiInvokeAttribute?.error;
    
    const [requestViewMode, setRequestViewMode] = useState<'ui' | 'raw'>('ui');
    const [responseViewMode, setResponseViewMode] = useState<'ui' | 'raw'>('ui');
    const [openAccordionItems, setOpenAccordionItems] = useState<string[]>(error ? ['error'] : []);
    const currentAttribute = span.attribute as any;

    let output: string | undefined = currentAttribute?.output || modelCallAttribute?.output
    const raw_response_string = output;
    const raw_response_json = raw_response_string ? tryParseJson(raw_response_string) : null;
    const cost_str = apiInvokeAttribute?.cost;
    const ttf_str = modelCallAttribute?.ttft;

    const raw_request_string = currentAttribute?.request || apiInvokeAttribute?.request;
    const raw_request_json = raw_request_string ? tryParseJson(raw_request_string) : null;

    const usage_str = currentAttribute?.usage;
    let virtualModelInfoStr = currentAttribute?.virtual_mdoel || currentAttribute?.virtual_model;
    const virtualModelInfo = virtualModelInfoStr ? tryParseJson(virtualModelInfoStr.replace("()", "\"\"")) : null;
    const modelName = virtualModelInfo?.slug;
    const costInfo = cost_str ? tryParseJson(cost_str) : null;
    const usageInfo = usage_str ? tryParseJson(usage_str) : null;

    const triggerClassName = "px-3 py-3 hover:bg-[#1a1a1a] transition-colors";
    const keys = raw_request_json && Object.keys(raw_request_json);
    const hasExtraParameters = keys && keys.filter((key: string) => key !== 'messages' && key !== 'tools' && key !== 'model').length > 0;
    const messageCount = raw_request_json?.messages?.length || 0;
    const parameterCount = keys?.filter((key: string) => key !== 'messages' && key !== 'tools' && key !== 'model').length || 0;

    const headerCount = headers ? Object.keys(headers).length : 0;
    const toolDefinitions: ToolInfoCall[] = raw_request_json?.tools || [];

    return (
        <BaseSpanUIDetailsDisplay 
            value={openAccordionItems} 
            onValueChange={setOpenAccordionItems}
        >
            {/* Header section with model info and status */}
            <div className="flex flex-col gap-2 p-3 border-b border-border rounded-t-md">
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
            {/* ID information section */}
            <BasicSpanInfo span={span} ttf_str={ttf_str} />

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
            {/* Request section with UI/Raw toggle */}
            {raw_request_json && (
                <AccordionItem value="raw_request">
                    <AccordionTrigger className={triggerClassName}>
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <ArrowRightLeftIcon className="w-4 h-4 text-blue-500" />
                                <span className="font-medium text-xs text-white">Request</span>
                            </div>
                            {/* Mode toggle using SimpleTabsList */}
                            <div>
                                <Tabs defaultValue={requestViewMode} className=" mr-2">
                                    <SimpleTabsList className="h-6 p-0.5 bg-[#1a1a1a]">
                                        <SimpleTabsTrigger
                                            value="ui"
                                            className="text-xs "
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setRequestViewMode('ui');
                                                // Auto-open the Request accordion if not already open
                                                if (!openAccordionItems.includes('raw_request')) {
                                                    setOpenAccordionItems(prev => [...prev, 'raw_request']);
                                                }
                                            }}
                                        >
                                            UI
                                        </SimpleTabsTrigger>
                                        <SimpleTabsTrigger
                                            value="raw"
                                            className="text-xs "
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setRequestViewMode('raw');
                                                // Auto-open the Request accordion if not already open
                                                if (!openAccordionItems.includes('raw_request')) {
                                                    setOpenAccordionItems(prev => [...prev, 'raw_request']);
                                                }
                                            }}
                                        >
                                            JSON
                                        </SimpleTabsTrigger>
                                    </SimpleTabsList>
                                </Tabs>
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-2 bg-[#0a0a0a] border-t border-border">
                        <RequestViewer jsonRequest={raw_request_json} viewMode={requestViewMode} />
                    </AccordionContent>
                </AccordionItem>
            )}

             {/* Response section with UI/Raw toggle */}
                        {raw_response_json && (
                            <AccordionItem value="raw_response">
                                <AccordionTrigger className={triggerClassName}>
                                    <div className="flex items-center justify-between w-full">
            
                                        <div className="flex items-center gap-2">
                                            <DocumentTextIcon className="w-4 h-4 text-blue-500" />
                                            <span className="font-medium text-xs text-white">Response</span>
                                        </div>
                                        {/* Mode toggle using SimpleTabsList */}
                                        <div>
                                            <Tabs defaultValue={responseViewMode} className=" mr-2">
                                                <SimpleTabsList className="h-6 p-0.5 bg-[#1a1a1a]">
                                                    <SimpleTabsTrigger
                                                        value="ui"
                                                        className="text-xs "
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setResponseViewMode('ui');
                                                            // Auto-open the Response accordion if not already open
                                                            if (!openAccordionItems.includes('raw_response')) {
                                                                setOpenAccordionItems(prev => [...prev, 'raw_response']);
                                                            }
                                                        }}
                                                    >
                                                        UI
                                                    </SimpleTabsTrigger>
                                                    <SimpleTabsTrigger
                                                        value="raw"
                                                        className="text-xs "
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setResponseViewMode('raw');
                                                            // Auto-open the Response accordion if not already open
                                                            if (!openAccordionItems.includes('raw_response')) {
                                                                setOpenAccordionItems(prev => [...prev, 'raw_response']);
                                                            }
                                                        }}
                                                    >
                                                        JSON
                                                    </SimpleTabsTrigger>
                                                </SimpleTabsList>
                                            </Tabs>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="bg-[#0a0a0a] border-t border-border p-2">
                                    <ResponseViewer response={raw_response_json} viewMode={responseViewMode} />
                                </AccordionContent>
                            </AccordionItem>
                        )}


            {/* Output section */}
            {/* {output && (
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
            )} */}

            {/* Usage section */}
            <AccordionItem value="usage">
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
            </AccordionItem>


        </BaseSpanUIDetailsDisplay>
    );
}