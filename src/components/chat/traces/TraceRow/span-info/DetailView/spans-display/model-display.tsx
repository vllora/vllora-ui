import { BaseSpanUIDetailsDisplay, getApiInvokeSpans, getModelCallSpans, getApiCloudInvokeSpans } from "..";
import { ResponseViewer } from "../response-viewer";
import { tryParseJson } from "@/utils/modelUtils";
import { Span } from "@/types/common-type";
import { InputViewer } from "../input_viewer";
import { UsageViewer } from "../usage-viewer";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { FlaskConical } from "lucide-react";

interface ModelInvokeUIDetailsDisplayProps {
    span: Span;
    relatedSpans?: Span[];
}

export const ModelInvokeUIDetailsDisplay = ({ span, relatedSpans = [] }: ModelInvokeUIDetailsDisplayProps) => {
    const navigate = useNavigate();
    const apiCloudInvokeSpan = getApiCloudInvokeSpans(relatedSpans, span.span_id);
    const apiInvokeSpan = getApiInvokeSpans(relatedSpans, span.span_id);
    const modelCallSpan = getModelCallSpans(relatedSpans, span.span_id);
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
    const raw_request_string = apiInvokeAttribute?.request || currentAttribute?.request;
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

    const handleExperiment = () => {
        navigate(`/experiment/${span.span_id}`);
    };

    return (
        <BaseSpanUIDetailsDisplay>
            <div className="flex flex-col gap-6 pb-4">
                <div className="flex justify-end">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExperiment}
                        className="gap-2"
                    >
                        <FlaskConical className="h-4 w-4" />
                        Experiment
                    </Button>
                </div>
                <InputViewer jsonRequest={raw_request_json} headers={headers} />
                <ResponseViewer response={raw_response_json} />
                <UsageViewer
                    cost={costInfo || undefined}
                    ttft={ttf_str || undefined}
                    usage={usageInfo || undefined}
                />
            </div>
        </BaseSpanUIDetailsDisplay>);
};
