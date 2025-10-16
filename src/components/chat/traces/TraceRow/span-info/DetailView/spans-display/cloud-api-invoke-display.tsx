import { Span } from "@/types/common-type";
import { BaseSpanUIDetailsDisplay } from ".."
import { ErrorViewer } from "../error-viewer";
import { tryParseJson } from "@/utils/modelUtils";
import { InputViewer } from "../input_viewer";
import { ResponseViewer } from "../response-viewer";
import { OtherPropertyViewer } from "../other-property-viewer";

interface CloudApiInvokeUIDetailsDisplayProps {
    span: Span;
    relatedSpans?: Span[];
}
const requestKeys = ['gcp.vertex.agent.llm_request'];
const responseKeys = ['gcp.vertex.agent.llm_response'];

export const CloudApiInvokeUIDetailsDisplay = ({ span }: CloudApiInvokeUIDetailsDisplayProps) => {
    const attribute = span?.attribute as any;
    const headersStr = attribute?.['http.request.header'];
    const headers = headersStr ? tryParseJson(headersStr) : undefined;
    const error = attribute?.error;
    const output = attribute?.response || attribute?.output;
    const request = attribute?.request;
    const inputInfo = request ? tryParseJson(request) : null;

    const otherPropsKeys = Object.keys(attribute).filter(key => !requestKeys.includes(key) && !responseKeys.includes(key));
    const otherProps = attribute && otherPropsKeys.reduce((acc, key) => {
        acc[key] = attribute[key];
        return acc;
    }, {} as any);

    return (
        <BaseSpanUIDetailsDisplay>
            <div className="flex flex-col gap-6 pb-4 divide-y divide-border/40">
                {error && (
                    <ErrorViewer error={error} />
                )}
                <InputViewer jsonRequest={inputInfo} headers={headers} />
                <ResponseViewer response={output} />
                {otherPropsKeys && otherPropsKeys.length > 0 && <>
                    <OtherPropertyViewer attributes={otherProps} label="Properties" />
                </>}
            </div>


        </BaseSpanUIDetailsDisplay>
    );
}