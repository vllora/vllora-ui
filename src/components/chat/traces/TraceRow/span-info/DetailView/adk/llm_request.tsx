
import { tryParseJson } from "@/utils/modelUtils";
import { JsonViewer } from "../../JsonViewer";

interface ADKLlmRequestViewerProps {
    llmRequest: string;
}


export const ADKLlmRequestViewer = ({ llmRequest }: ADKLlmRequestViewerProps) => {

    // Try to parse JSON for better display
    const parsedRequest = typeof llmRequest === 'string' ? tryParseJson(llmRequest) : llmRequest;

    // Extract messages and parameters if available
    const parameters = parsedRequest ? { ...parsedRequest } : {};

    return (
        <div className="bg-[#0a0a0a] border border-border rounded-md overflow-hidden">

            {!parsedRequest && (
                <div className="p-3 bg-[#0d0d0d]">
                    <pre className="text-xs text-white font-mono whitespace-pre-wrap">{llmRequest}</pre>
                </div>
            )}

            {parsedRequest && (
                <div className="bg-[#0d0d0d]">
                    <JsonViewer
                        data={parameters}
                        style={{
                            fontSize: '11px',
                            backgroundColor: '#0d0d0d',
                        }}
                    />
                </div>
            )}
        </div>
    );
}