import { BaseSpanUIDetailsDisplay, getParentCloudApiInvoke } from ".."
import { ErrorViewer } from "../error-viewer";
import { RequestResponseViewer } from "../request-response-viewer";
import { tryParseJson } from "@/utils/modelUtils";
import { Span } from "@/types/common-type";
import { getDuration } from "../../SpanHeader";

interface ApiInvokeUIDetailsDisplayProps {
    span: Span;
    relatedSpans?: Span[];
}

export const ApiInvokeUIDetailsDisplay = ({ span, relatedSpans = [] }: ApiInvokeUIDetailsDisplayProps) => {
    const currentAttribute = span.attribute as any;
    let output: string | undefined = currentAttribute?.output || currentAttribute?.response;
    if (!output || output === "\"\"") {
        output = currentAttribute?.output;
    }
    let response: string | undefined = currentAttribute?.response;
    if (!response || response === "\"\"") {
        response = currentAttribute?.response;
    }
    const raw_request_string = currentAttribute?.request;
    const raw_response_string = output;
    const raw_response_json = raw_response_string ? tryParseJson(raw_response_string) : null;
    const raw_request_json = raw_request_string ? tryParseJson(raw_request_string) : null;

    const apiCloudInvokeSpan = getParentCloudApiInvoke(relatedSpans, span.span_id);
    const apiInvokeSpan = span
    const modelCallSpan = span
    const modelCallAttribute = modelCallSpan?.attribute as any;
    const apiInvokeAttribute = apiInvokeSpan?.attribute as any;
    const apiCloudInvokeAttribute = apiCloudInvokeSpan?.attribute as any;
    const headersStr = apiCloudInvokeAttribute?.['http.request.header'];
    const headers = headersStr ? tryParseJson(headersStr) : undefined;
    const error = modelCallAttribute?.error || apiInvokeAttribute?.error || currentAttribute?.error;

    const cost_str = apiInvokeAttribute?.cost;
    const usage_str = currentAttribute?.usage;
    const costInfo = cost_str ? tryParseJson(cost_str) : null;
    const usageInfo = usage_str ? tryParseJson(usage_str) : null;
    const startTime = span.start_time_us;
    const endTime = span.finish_time_us;
    const duration = endTime && startTime ? getDuration(startTime, endTime) : undefined;
    return (
        <BaseSpanUIDetailsDisplay
        >
            <div className="flex flex-col gap-4 mt-4">

                {/* Error section - only shown when there's an error */}
                {error && (
                    <ErrorViewer error={error} />
                )}

                {/* Request/Response section with tabs */}
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

                {/* Usage section */}
                {/* <UsageViewer
                    cost={costInfo || undefined}
                    ttft={ttf_str || undefined}
                    usage={usageInfo || undefined}
                /> */}
            </div>

        </BaseSpanUIDetailsDisplay>
    );
}