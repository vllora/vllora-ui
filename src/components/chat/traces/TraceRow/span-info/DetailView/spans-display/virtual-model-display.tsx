import { BaseSpanUIDetailsDisplay, getParentApiInvoke, getParentCloudApiInvoke } from ".."
import { getStatus } from "../index";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ExclamationTriangleIcon, CheckCircleIcon, ClockIcon, CodeBracketIcon, DocumentTextIcon, BoltIcon } from "@heroicons/react/24/outline";
import { ErrorViewer } from "../error-viewer";
import { UsageViewer } from "../usage-viewer";
import { HeadersViewer } from "../headers-viewer";
import { InputViewer } from "../input_viewer";
import { SimpleTabsList, SimpleTabsTrigger, Tabs } from "@/components/ui/tabs";
import { useState } from "react";
import { ArrowRightLeftIcon } from "lucide-react";
import { ResponseViewer } from "../response-viewer";
import { Span } from "@/types/common-type";
import { tryParseJson } from "@/utils/modelUtils";

interface VirtualModelCallUIDetailsDisplayProps {
    span: Span;
    relatedSpans?: Span[];
}

export const VirtualModelCallUIDetailsDisplay = ({ span, relatedSpans = [] }: VirtualModelCallUIDetailsDisplayProps) => {
    const apiCloudInvokeSpan = getParentCloudApiInvoke(relatedSpans, span.span_id);
    const apiInvokeSpan = getParentApiInvoke(relatedSpans, span.span_id);
    const modelCallSpan = span
    const modelCallAttribute = modelCallSpan?.attribute as any;
    const apiInvokeAttribute = apiInvokeSpan?.attribute as any;
    const apiCloudInvokeAttribute = apiCloudInvokeSpan?.attribute as any;
    const headersStr = apiCloudInvokeAttribute?.['http.request.header'];
    const headers = headersStr ? tryParseJson(headersStr) : undefined;
    const currentAttribute = span.attribute as any;

    let output: string | undefined = currentAttribute?.output || modelCallAttribute?.output
    const raw_response_string = output;
    const raw_response_json = raw_response_string ? tryParseJson(raw_response_string) : null;
    const cost_str = apiInvokeAttribute?.cost;
    const ttf_str = modelCallAttribute?.ttft;

    const raw_request_string = currentAttribute?.request || apiInvokeAttribute?.request;
    const raw_request_json = raw_request_string ? tryParseJson(raw_request_string) : null;

    const usage_str = currentAttribute?.usage;
    const costInfo = cost_str ? tryParseJson(cost_str) : null;
    const usageInfo = usage_str ? tryParseJson(usage_str) : null;
    return (
        <BaseSpanUIDetailsDisplay>
            <div className="flex flex-col gap-6 pb-4">
                <InputViewer jsonRequest={raw_request_json} headers={headers} />
                <ResponseViewer response={raw_response_json} />
                <UsageViewer
                    cost={costInfo || undefined}
                    ttft={ttf_str || undefined}
                    usage={usageInfo || undefined}
                />
            </div>
        </BaseSpanUIDetailsDisplay>);
}