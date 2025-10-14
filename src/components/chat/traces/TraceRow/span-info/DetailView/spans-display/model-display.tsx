import { BaseSpanUIDetailsDisplay, getApiInvokeSpans, getModelCallSpans, getApiCloudInvokeSpans } from "..";
import { ResponseViewer } from "../response-viewer";
import { tryParseJson } from "@/utils/modelUtils";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { Span } from "@/types/common-type";
import { InputViewer } from "../input_viewer";
import { BasicSpanInfo } from "../basic-span-info-section";
import { UsageViewer } from "../usage-viewer";


export const ModelInvokeUIDetailsDisplay = ({ span }: { span: Span }) => {
    const { spansOfSelectedRun } = ChatWindowConsumer();
    const apiCloudInvokeSpan = getApiCloudInvokeSpans(spansOfSelectedRun, span.span_id);
    const apiInvokeSpan = getApiInvokeSpans(spansOfSelectedRun, span.span_id);
    const modelCallSpan = getModelCallSpans(spansOfSelectedRun, span.span_id);
    const currentAttribute = span.attribute as any;
    const modelCallAttribute = modelCallSpan?.attribute as any;
    const apiInvokeAttribute = apiInvokeSpan?.attribute as any;
    const apiCloudInvokeAttribute = apiCloudInvokeSpan?.attribute as any;

    let output: string | undefined = currentAttribute?.output || modelCallAttribute?.output
    if (!output || output === "\"\"") {
        output = currentAttribute?.output;
    }
    let response: string | undefined = currentAttribute?.response || modelCallAttribute?.response || apiInvokeAttribute?.response || apiCloudInvokeAttribute?.response;
    if (!response || response === "\"\"") {
        response = currentAttribute?.response;
    }

    const raw_request_string = currentAttribute?.request || apiInvokeAttribute?.request;
    const raw_response_string = output;
    const raw_response_json = raw_response_string ? tryParseJson(raw_response_string) : null;
    const raw_request_json = raw_request_string ? tryParseJson(raw_request_string) : null;
    const cost_str = currentAttribute?.cost || apiInvokeAttribute?.cost;
    const usage_str = currentAttribute?.usage;
    const costInfo = cost_str ? tryParseJson(cost_str) : null;
    const usageInfo = usage_str ? tryParseJson(usage_str) : null;
    const ttf_str = modelCallAttribute?.ttft;


    const headersStr = apiCloudInvokeAttribute?.['http.request.header'];
    const headers = headersStr ? tryParseJson(headersStr) : undefined;

    return (
        <BaseSpanUIDetailsDisplay>
            <BasicSpanInfo span={span} ttf_str={ttf_str} />
            <div className="flex flex-col gap-6 mt-4 pb-4">
                <InputViewer jsonRequest={raw_request_json} headers={headers} />
                <div className="h-px w-full bg-border/60" />
                <ResponseViewer response={raw_response_json} />
                <UsageViewer
                    cost={costInfo || undefined}
                    ttft={ttf_str || undefined}
                    usage={usageInfo || undefined}
                />
            </div>
        </BaseSpanUIDetailsDisplay>);
};
