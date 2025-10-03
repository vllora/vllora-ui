import { JsonViewer } from "../../JsonViewer";
import { tryParseJson } from "@/utils/modelUtils";

interface ADKLlmResponseViewerProps {
    llmResponse: string;
}

export const ADKLlmResponseViewer = ({ llmResponse }: ADKLlmResponseViewerProps) => {
  
    // Try to parse JSON for better display
    const parsedResponse = typeof llmResponse === 'string' ? tryParseJson(llmResponse) : llmResponse;
    
    return (
        <div className="bg-[#0a0a0a] border border-border rounded-md overflow-hidden">

            {!parsedResponse && (
                <div className="p-3 bg-[#0d0d0d]">
                    <pre className="text-xs text-white font-mono whitespace-pre-wrap">{llmResponse}</pre>
                </div>
            )}

            {parsedResponse && (
                <div className="bg-[#0d0d0d]">
                    <JsonViewer
                        data={parsedResponse}
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