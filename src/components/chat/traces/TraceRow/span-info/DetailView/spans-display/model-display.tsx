import { BaseSpanUIDetailsDisplay, getApiInvokeSpans, getModelCallSpans, getApiCloudInvokeSpans } from "..";
import { ResponseViewer } from "../response-viewer";
import { tryParseJson } from "@/utils/modelUtils";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { Span } from "@/types/common-type";
import { InputViewer } from "../input_viewer";


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

    return (
    <BaseSpanUIDetailsDisplay>
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 rounded-lg border border-border/40 bg-zinc-50/30 p-4 dark:bg-zinc-900/20">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Input
                </span>
                <InputViewer jsonRequest={raw_request_json} />
            </div>
            <div className="h-px w-full bg-border/60" />
            <div className="flex flex-col gap-3 rounded-lg border border-border/40 bg-zinc-50/30 p-4 dark:bg-zinc-900/20">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Output
                </span>
                <ResponseViewer response={raw_response_json} />
            </div>
        </div>
    </BaseSpanUIDetailsDisplay>);
};
