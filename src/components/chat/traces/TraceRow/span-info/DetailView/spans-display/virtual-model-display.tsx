import { BaseSpanUIDetailsDisplay, getParentApiInvoke, getParentCloudApiInvoke } from ".."
import { RequestResponseViewer } from "../request-response-viewer";
import { Span } from "@/types/common-type";
import { tryParseJson } from "@/utils/modelUtils";
import { getDuration } from "../../SpanHeader";

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

    const raw_request_string = currentAttribute?.request || apiInvokeAttribute?.request;
    const raw_request_json = raw_request_string ? tryParseJson(raw_request_string) : null;

    const usage_str = currentAttribute?.usage;
    const costInfo = cost_str ? tryParseJson(cost_str) : null;
    const usageInfo = usage_str ? tryParseJson(usage_str) : null;
    const startTime = span.start_time_us;
    const endTime = span.finish_time_us;
    const duration = endTime && startTime ? getDuration(startTime, endTime) : undefined;

    return (
        <BaseSpanUIDetailsDisplay>
            <div className="flex flex-col gap-6 pb-4">
                <RequestResponseViewer
                    jsonRequest={raw_request_json}
                    response={raw_response_json}
                    headers={headers}
                    span={span}
                    latency={duration ?? undefined}
                    startTime={startTime}
                    endTime={endTime}
                    usage={usageInfo}
                    costInfo={costInfo}
                />
            </div>
        </BaseSpanUIDetailsDisplay>);
}