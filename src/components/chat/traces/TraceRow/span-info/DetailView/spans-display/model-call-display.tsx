import { Span } from "@/types/common-type";
import { BaseSpanUIDetailsDisplay, getParentApiInvoke, getParentCloudApiInvoke } from ".."
import { getStatus } from "../index";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ExclamationTriangleIcon, CheckCircleIcon, CpuChipIcon } from "@heroicons/react/24/outline";
import { ErrorViewer } from "../error-viewer";
import { UsageViewer } from "../usage-viewer";
import { InputViewer } from "../input_viewer";
import { useState } from "react";
import { ResponseViewer } from "../response-viewer";
import { tryParseJson } from "@/utils/modelUtils";

interface ModelCallUIDetailsDisplayProps {
    span: Span;
    relatedSpans?: Span[];
}

export const ModelCallUIDetailsDisplay = ({ span, relatedSpans = [] }: ModelCallUIDetailsDisplayProps) => {
    const status = getStatus(relatedSpans, span.span_id);
    const apiCloudInvokeSpan = getParentCloudApiInvoke(relatedSpans, span.span_id);
    const apiInvokeSpan = getParentApiInvoke(relatedSpans, span.span_id);
    const modelCallSpan = span
    const modelCallAttribute = modelCallSpan?.attribute as any;
    const apiInvokeAttribute = apiInvokeSpan?.attribute as any;
    const apiCloudInvokeAttribute = apiCloudInvokeSpan?.attribute as any;
    const headersStr = apiCloudInvokeAttribute?.['http.request.header'];
    const headers = headersStr ? tryParseJson(headersStr) : undefined;
    const error = modelCallAttribute?.error || apiInvokeAttribute?.error;

    const [openAccordionItems, setOpenAccordionItems] = useState<string[]>(error ? ['error'] : []);
    const currentAttribute = span?.attribute as any;
    let output: string | undefined = currentAttribute?.output || modelCallAttribute?.output
    const raw_response_string = output;
    const raw_response_json = raw_response_string ? tryParseJson(raw_response_string) : null;
    const cost_str = apiInvokeAttribute?.cost;
    const ttf_str = modelCallAttribute?.ttft;
    const raw_request_string = currentAttribute?.request;
    const raw_request_json = raw_request_string ? tryParseJson(raw_request_string) : null;

    const usage_str = currentAttribute?.usage;
    const modelJsonStr = apiInvokeAttribute?.model || modelCallAttribute?.model;
    const modelJson = modelJsonStr ? tryParseJson(modelJsonStr) : null;
    const modelName = modelJson?.name;

    const entityByName = undefined;


    const costInfo = cost_str ? tryParseJson(cost_str) : null;
    const usageInfo = usage_str ? tryParseJson(usage_str) : null;

    const triggerClassName = "px-3 py-3 hover:bg-[#1a1a1a] transition-colors";

    return (
        <BaseSpanUIDetailsDisplay
            value={openAccordionItems}
            onValueChange={setOpenAccordionItems}
        >
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

                </div>

            </div>

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
            {/* Request section with UI/Raw toggle */}
            {raw_request_json && (
                <InputViewer jsonRequest={raw_request_json} headers={headers} />
            )}

            {/* Response section with UI/Raw toggle */}
            {raw_response_json && (
                <ResponseViewer response={raw_response_json} />
            )}




            {/* Usage section */}
            <UsageViewer
                cost={costInfo || undefined}
                ttft={ttf_str || undefined}
                usage={usageInfo || undefined}
            />


        </BaseSpanUIDetailsDisplay>
    );
}