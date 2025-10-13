import { BaseSpanUIDetailsDisplay, getApiInvokeSpans, getModelCallSpans, getApiCloudInvokeSpans } from ".."
import { getStatus } from "../index";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ExclamationTriangleIcon, CheckCircleIcon, ClockIcon, CodeBracketIcon, DocumentTextIcon, BoltIcon } from "@heroicons/react/24/outline";
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
import { MessageViewer } from "../message-viewer";

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
    const cost_str = currentAttribute?.cost || apiInvokeAttribute?.cost;
    const ttf_str = modelCallAttribute?.ttft;
    const usage_str = currentAttribute?.usage;
    const router_metric_resolution_str = currentAttribute?.['router.metric_resolution'];
    const router_metric_resolution = router_metric_resolution_str ? tryParseJson(router_metric_resolution_str) : null;

    const entityByName = undefined;


    const costInfo = cost_str ? tryParseJson(cost_str) : null;
    const usageInfo = usage_str ? tryParseJson(usage_str) : null;
    const raw_request_json = raw_request_string ? tryParseJson(raw_request_string) : null;

    const triggerClassName = "px-3 py-3 hover:bg-[#1a1a1a] transition-colors";
    const headerCount = headers ? Object.keys(headers).length : 0;

    const havingPromptCaching = span && isPromptCachingApplied(span);
    const isSuccessStatus = status && ['200', 200].includes(status);

     let messages = raw_request_json?.messages;
    if(!messages && raw_request_json?.contents){
        messages = raw_request_json?.contents;
    }

    console.log('===== messages', messages)
    return (<BaseSpanUIDetailsDisplay
            value={openAccordionItems}
            onValueChange={setOpenAccordionItems}
        >
            {messages && (
                <div className="rounded-2xl bg-[#101010] p-4 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Input
                    </div>
                    <MessageViewer
                        messages={messages as any}
                    />
                </div>
            )}
            
        </BaseSpanUIDetailsDisplay>)
}
