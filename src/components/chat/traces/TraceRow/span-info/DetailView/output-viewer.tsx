import { tryParseJson } from "@/utils/modelUtils";
import { JsonViewer } from "../JsonViewer";
import { MarkdownViewer } from "./markdown-viewer";

export const OutputViewer = (props: { response_str?: string }) => {
    const { response_str } = props;
    let responseJson = response_str ? tryParseJson(response_str) : null;

    if (responseJson === undefined) {
        // If response_str is not a JSON object (doesn't start/end with curly braces)
        if (response_str && (!response_str.trim().startsWith('{') || !response_str.trim().endsWith('}'))) {
            // trim first and last quote, only if it's a string and starts with quote
            if (response_str.startsWith('"') && response_str.endsWith('"')) {
                responseJson = response_str.trim().slice(1, -1);
            } else {
                responseJson = response_str;
            }
        }
    } else if (typeof responseJson === 'string' && responseJson.startsWith('{') && responseJson.trim().endsWith('}')) {
        let parsedJson = tryParseJson(responseJson);
        if (parsedJson) {
            responseJson = parsedJson;
        }
    }
    const isJson = responseJson && typeof responseJson === 'object';
    return (
        <div className="flex flex-col gap-4 overflow-y-auto">
            <div className="flex flex-col gap-2 items-start">
                {isJson ? (
                    <JsonOutputViewer jsonObj={responseJson} />
                ) : (
                    <>
                        <div className="bg-[#1a1a1a] rounded-lg p-3 text-xs text-gray-200 whitespace-pre-wrap">
                            <MarkdownViewer message={responseJson ?? 'No response'} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

const JsonOutputViewer = (props: { jsonObj?: any }) => {
    const { jsonObj } = props;
    return (
        <div className="flex flex-col gap-4 max-h-[500px] overflow-y-auto">
            <JsonViewer data={jsonObj} style={{
                fontSize: '10px'
            }} />
        </div>
    );
}