import { tryParseJson } from "@/utils/modelUtils";
import { BaseSpanUIDetailsDisplay } from ".."
import { Span } from "@/types/common-type";
import { InputViewer } from "../input_viewer";
import { ResponseViewer } from "../response-viewer";
import { OtherPropertyViewer } from "../other-property-viewer";

interface TaskUIDisplayProps {
    span: Span;
}

const requestKeys = ['gcp.vertex.agent.llm_request'];
const responseKeys = ['gcp.vertex.agent.llm_response'];
const getRequest = (attributes: any) => {
    for (const key of requestKeys) {
        if (attributes[key]) {
            return attributes[key];
        }
    }
    return null;
}

const getResponse = (attributes: any) => {
    for (const key of responseKeys) {
        if (attributes[key]) {
            return attributes[key];
        }
    }
    return null;
}

export const TaskUIDisplay = ({ span }: TaskUIDisplayProps) => {

    const attributes = span.attribute as any;
    const requestStr = getRequest(attributes);
    const responseStr = getResponse(attributes);
    const responseJson = responseStr ? tryParseJson(responseStr) : null;
    const requestJson = requestStr ? tryParseJson(requestStr) : null;
    const otherPropsKeys = Object.keys(attributes).filter(key => !requestKeys.includes(key) && !responseKeys.includes(key));
    const otherProps = attributes && otherPropsKeys.reduce((acc, key) => {
        acc[key] = attributes[key];
        return acc;
    }, {} as any);
    return (
        <BaseSpanUIDetailsDisplay>
            <div className="flex flex-col gap-6 pb-4">
                <InputViewer jsonRequest={requestJson} />
                <div className="h-px w-full bg-border/60" />
                <ResponseViewer response={responseJson} />
                { otherPropsKeys && otherPropsKeys.length > 0 && <>
                <div className="h-px w-full bg-border/60" />
                    <OtherPropertyViewer attributes={otherProps} />
                </>}
            </div>

        </BaseSpanUIDetailsDisplay>
    );
}