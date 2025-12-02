import { BaseSpanUIDetailsDisplay, getApiInvokeSpans, getModelCallSpans, getApiCloudInvokeSpans } from "..";
import { ResponseViewer } from "../response-viewer";
import { tryParseJson } from "@/utils/modelUtils";
import { Span } from "@/types/common-type";
import { InputViewer } from "../input_viewer";
import { UsageViewer } from "../usage-viewer";
import { Layers2Icon } from "lucide-react";
import { useNavigate } from "react-router";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCallback } from "react";

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

    const handleExperiment = useCallback(() => {
        if (apiInvokeSpan?.span_id) {
            navigate(`/experiment?span_id=${apiInvokeSpan?.span_id}`);
        } else if (span?.span_id) {
            navigate(`/experiment?span_id=${span?.span_id}`);
        }
    }, [apiInvokeSpan, span]);

    const experimentButton = (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        onClick={handleExperiment}
                        className="px-2 py-1 text-[rgb(var(--theme-500))] transition-all duration-300 hover:scale-110 hover:text-[rgb(var(--theme-500))]"
                    >
                        <Layers2Icon className="w-3.5 h-3.5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="px-3 py-2.5 max-w-[220px]">
                    <div className="flex gap-2">
                        <Layers2Icon className="w-3.5 h-3.5 text-[rgb(var(--theme-500))] flex-shrink-0 mt-0.5" />
                        <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-xs">Clone request</span>
                            <span className="text-[10px] text-muted-foreground leading-tight">
                                Clone this request to experiment with various prompts, models, or parameters
                            </span>
                        </div>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );

    return (
        <BaseSpanUIDetailsDisplay>
            <div className="flex flex-col gap-6 pb-4">
                <InputViewer
                    jsonRequest={raw_request_json}
                    headers={headers}
                    headerAction={experimentButton}
                />
                <ResponseViewer response={raw_response_json} />
                <UsageViewer
                    cost={costInfo || undefined}
                    ttft={ttf_str || undefined}
                    usage={usageInfo || undefined}
                />
            </div>
        </BaseSpanUIDetailsDisplay>
    );
};
