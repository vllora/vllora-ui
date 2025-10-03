import { BaseSpanUIDetailsDisplay, getApiInvokeSpans, getModelCallSpans, getApiCloudInvokeSpans } from ".."
import { getStatus } from "../index";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ExclamationTriangleIcon, CheckCircleIcon, ClockIcon, CodeBracketIcon, DocumentTextIcon, WrenchScrewdriverIcon, BoltIcon } from "@heroicons/react/24/outline";
import { ArrowRightLeftIcon, DatabaseIcon, ExternalLink, Grid2x2Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ErrorViewer } from "../error-viewer";
import { UsageViewer } from "../usage-viewer";
import { HeadersViewer } from "../headers-viewer";
import { BasicSpanInfo } from "../basic-span-info-section";
import { getCachedTokens, PromptCachingInfo } from "./prompt-caching-tooltip";
import { RequestViewer } from "../request-viewer";
import { useState } from "react";
import { SimpleTabsList, SimpleTabsTrigger, Tabs } from "@/components/ui/tabs";
import { ResponseViewer } from "../response-viewer";
import { JsonViewer } from "../../JsonViewer";
import { tryParseJson } from "@/utils/modelUtils";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { Span } from "@/types/common-type";
import { isPromptCachingApplied } from "@/utils/graph-utils";

const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
};


export const ModelInvokeUIDetailsDisplay = ({ span }: { span: Span }) => {
    const { spansOfSelectedRun } = ChatWindowConsumer();
    const remainingSpans = spansOfSelectedRun.filter((span: Span) => !["cloud_api_invoke", "api_invoke", "model_call"].includes(span.operation_name));
    const isSingleSpan = remainingSpans.length === 1;
    const status = getStatus(spansOfSelectedRun, span.span_id);
    const apiCloudInvokeSpan = getApiCloudInvokeSpans(spansOfSelectedRun, span.span_id);
    const apiInvokeSpan = getApiInvokeSpans(spansOfSelectedRun, span.span_id);
    const modelCallSpan = getModelCallSpans(spansOfSelectedRun, span.span_id);
    const currentAttribute = span.attribute as any;
    const modelCallAttribute = modelCallSpan?.attribute as any;
    const apiInvokeAttribute = apiInvokeSpan?.attribute as any;

    const apiCloudInvokeAttribute = apiCloudInvokeSpan?.attribute as any;
    const headersStr = apiCloudInvokeAttribute?.['http.request.header'];
    const headers = headersStr ? tryParseJson(headersStr) : undefined;
    const error = modelCallAttribute?.error || apiInvokeAttribute?.error;
    
    const [requestViewMode, setRequestViewMode] = useState<'ui' | 'raw'>('ui');
    const [responseViewMode, setResponseViewMode] = useState<'ui' | 'raw'>('ui');
    const [openAccordionItems, setOpenAccordionItems] = useState<string[]>(error ? ['error'] : []);
    let output: string | undefined = currentAttribute?.output || modelCallAttribute?.output
    if (!output || output === "\"\"") {
        output = currentAttribute?.output;
    }
    let response: string | undefined = currentAttribute?.response || modelCallAttribute?.response || apiInvokeAttribute?.response || apiCloudInvokeAttribute?.response;
    if (!response || response === "\"\"") {
        response = currentAttribute?.response;
    }

    const cache_state: string = currentAttribute?.cache_state || '';
    const raw_request_string = currentAttribute?.request || apiInvokeAttribute?.request;
    const raw_response_string = output;
    const raw_response_json = raw_response_string ? tryParseJson(raw_response_string) : null;
    const isFinishReasonStop = raw_response_json?.finish_reason === 'stop';
    const otherLevelMessages = (isSingleSpan || isFinishReasonStop) ? (apiInvokeAttribute?.response ? [apiInvokeAttribute?.response] : undefined) : undefined;
    const cost_str = apiInvokeAttribute?.cost;
    const ttf_str = modelCallAttribute?.ttft;
    const usage_str = currentAttribute?.usage;
    const modelJsonStr = apiInvokeAttribute?.model || modelCallAttribute?.model;
    const modelJson = modelJsonStr ? tryParseJson(modelJsonStr) : null;
    const modelName = modelJson?.name;
    const router_metric_resolution_str = currentAttribute?.['router.metric_resolution'];
    const router_metric_resolution = router_metric_resolution_str ? tryParseJson(router_metric_resolution_str) : null;

    const entityByName = undefined;


    const costInfo = cost_str ? tryParseJson(cost_str) : null;
    const usageInfo = usage_str ? tryParseJson(usage_str) : null;
    const raw_request_json = raw_request_string ? tryParseJson(raw_request_string) : null;

    const triggerClassName = "px-3 py-3 hover:bg-[#1a1a1a] transition-colors";
    const headerCount = headers ? Object.keys(headers).length : 0;

    const havingPromptCaching = span && isPromptCachingApplied(span);
    return (
        <BaseSpanUIDetailsDisplay 
            value={openAccordionItems} 
            onValueChange={setOpenAccordionItems}
        >
            {/* Header section with model info and status */}
            <div className="flex flex-col gap-2 p-2 px-0 border-b border-border">
                <div className="flex items-center justify-between px-1">

                    {/* {entityByName && (entityByName as LLMRouter).strategy && (
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

                {/* Response Cache state indicator with tooltip */}
                {cache_state && (
                    <div className="flex items-center gap-2 w-full px-3 justify-between pt-2 border-t border-border">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center gap-2 cursor-help">
                                        <DatabaseIcon className="h-3.5 w-3.5 text-blue-400" />
                                        <span className="text-xs text-white">Cache</span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-[300px] p-3">
                                    <div className="flex flex-col gap-2">
                                        <p className="text-xs">
                                            {cache_state === 'HIT' ?
                                                'This response was retrieved from cache, saving time and costs.' :
                                                'This response was not found in cache and was generated fresh.'}
                                        </p>
                                        <a
                                            href="https://docs.langdb.ai/features/response-caching"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                                        >
                                            Learn more about response caching
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className={`flex items-center px-2 py-1 rounded-md text-xs cursor-help ${cache_state === 'HIT' ? 'bg-[#1a2e1a] text-green-500 border border-green-800' : 'bg-black text-amber-400 border border-amber-800'}`}>
                                        {cache_state}
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="p-2">
                                    {cache_state === 'HIT' ? (
                                        <p className="text-xs">Cache hit: Response was served from cache</p>
                                    ) : (
                                        <p className="text-xs">Cache miss: Response was generated fresh</p>
                                    )}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                )}


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
                                {typeof raw_response_json !== 'string' && <Tabs defaultValue={responseViewMode} className=" mr-2">
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
                                </Tabs>}
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="bg-[#0a0a0a] border-t border-border p-2">
                        <ResponseViewer otherLevelMessages={otherLevelMessages} response={raw_response_json} viewMode={responseViewMode} />
                    </AccordionContent>
                </AccordionItem>
            )}


            {/* Router metric resolution */}
            {router_metric_resolution && typeof router_metric_resolution === 'object' && (
                <AccordionItem value="router_metric_resolution">
                    <AccordionTrigger className={triggerClassName}>
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <Grid2x2Check className="w-4 h-4 text-[#8b5cf6]" />
                                <span className="font-medium text-xs text-white">Resolution</span>
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-2 bg-[#0a0a0a] border-t border-border text-xs">
                        <JsonViewer data={router_metric_resolution} collapseStringsAfterLength={200} collapsed={4} />
                    </AccordionContent>
                </AccordionItem>
            )}

            {havingPromptCaching && (<AccordionItem value="prompt-caching">
                <AccordionTrigger className={triggerClassName}>
                    <div className="flex items-center w-full justify-between">
                        <div className="flex items-center gap-2 cursor-help">
                            <DatabaseIcon className="h-3.5 w-3.5 text-amber-400" />
                            <span className="text-xs font-medium text-white">Prompt Caching</span>
                        </div>
                        {/* Quick stats - show total cache read tokens */}
                        <div className="flex items-center gap-1 text-xs text-zinc-400">
                            {(() => {
                                let cacheTokenInfo = getCachedTokens(usageInfo);
                                return (
                                    <>
                                        <span className="text-amber-400 font-medium">{formatNumber((cacheTokenInfo.read || 0) + (cacheTokenInfo.write || 0))}</span>
                                        <span> {cacheTokenInfo.read > 0 ? 'tokens read from cache' : 'tokens write to cache'}</span>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="bg-[#0a0a0a] border-t border-border p-2">
                    <PromptCachingInfo
                        usageInfo={usageInfo}
                        costInfo={costInfo}
                        entityByName={entityByName}
                    />
                </AccordionContent>
            </AccordionItem>)}


            {/* Usage section */}
            {
                (costInfo || ttf_str || usageInfo) && <AccordionItem value="usage">
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
            }
        </BaseSpanUIDetailsDisplay >
    );
}