import { BookmarkIcon, BoxIcon, FileJson } from "lucide-react";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowsPointingInIcon, ArrowsPointingOutIcon, WrenchIcon } from "@heroicons/react/24/outline";
import { tryParseJson } from "@/utils/modelUtils";
import { JsonViewer } from "../../../JsonViewer";
import { Span } from "@/types/common-type";


export const AgnoInfoUIDisplay = ({ span }: { span: Span }) => {
    let attribute = span.attribute as any;
    let span_kind = attribute?.['openinference.span.kind'];
    let model_name = attribute?.['llm.model_name'];
    let input_mime_type = attribute?.['input.mime_type'] || 'text/plain';
    let output_mime_type = attribute?.['output.mime_type'] || 'text/plain';
    let input_value = attribute?.['input.value'];
    let output_value = attribute?.['output.value'];
    let tool_descriptions = attribute?.['tool.description'];
    let input_value_json = input_value ? tryParseJson(input_value) : null;
    let output_value_json = output_value ? tryParseJson(output_value) : null;
    const triggerClassName = "px-3 py-3 hover:bg-[#1a1a1a] transition-colors";
    let filterOutAttributes = ['openinference.span.kind', 'tool.description', 'langdb_client_name', 'vllora.client_name', 'model_name', 'input.mime_type', 'output.mime_type', 'input.value', 'output.value'];
    let filteredAttributes = Object.keys(attribute).filter(key => !filterOutAttributes.includes(key));
    let filteredAttribute = filteredAttributes.reduce((acc, key) => {
        acc[key] = attribute[key];
        return acc;
    }, {} as any);

    return (
        <>
            {span_kind && (
                <div className={`flex items-center justify-between px-3 py-2 border-b border-border`}>
                    <div className="flex items-center gap-2">
                        <BookmarkIcon className="h-3.5 w-3.5 text-white" />
                        <span className="text-xs text-white w-[65px]">Span Kind:</span>
                        <span className="text-xs bg-[#1a1a1a] px-2 py-0.5 rounded text-teal-500">
                            {span_kind}
                        </span>
                    </div>
                </div>

            )}
            {tool_descriptions && (
                <div className={`flex items-center justify-between px-3 py-2 border-b border-border`}>
                    <div className="flex items-center gap-2">
                        <WrenchIcon className="h-3.5 w-3.5 text-white" />
                        <span className="text-xs text-white">Tool description</span>
                    </div>
                </div>
            )}
            {model_name && (
                <div className={`flex items-center justify-between px-3 py-2 border-b border-border`}>
                    <div className="flex items-center gap-2">
                        <BoxIcon className="h-3.5 w-3.5 text-white" />
                        <span className="text-xs text-white w-[65px]">Model:</span>
                        <span className="text-xs bg-[#1a1a1a] px-2 py-0.5 rounded text-teal-500">
                            {model_name}
                        </span>
                    </div>
                </div>

            )}
            {input_value && input_mime_type && (
                <div className={`flex items-center justify-between px-3 py-2 border-b border-border`}>
                    <div className="flex items-center gap-2">
                        <ArrowsPointingInIcon className="h-3.5 w-3.5 text-white" />
                        <span className="text-xs text-white w-[65px]">Input:</span>
                        <span className="text-xs bg-[#1a1a1a] px-2 py-0.5 rounded text-teal-500">
                            {input_mime_type}
                        </span>
                    </div>
                </div>

            )}
            {input_value_json ? (
                <div className={`flex items-center justify-between px-3 py-2 border-b border-border`}>
                    <JsonViewer data={input_value_json} style={{
                        fontSize: '10px'
                    }} />
                </div>
            ) : (
                <div className={`flex items-center justify-between px-3 py-2 border-b border-border`}>
                    <div className="p-3 bg-[#0d0d0d]">
                        <pre className="text-xs text-white font-mono whitespace-pre-wrap">{input_value}</pre>
                    </div>
                </div>
            )}
            {output_mime_type && (
                <div className={`flex items-center justify-between px-3 py-2 border-b border-border`}>
                    <div className="flex items-center gap-2">
                        <ArrowsPointingOutIcon className="h-3.5 w-3.5 text-white" />
                        <span className="text-xs text-white w-[65px]">Output:</span>
                        <span className="text-xs bg-[#1a1a1a] px-2 py-0.5 rounded text-teal-500">
                            {output_mime_type}
                        </span>
                    </div>
                </div>

            )}
            {output_value_json ? (
                <div className={`flex items-center justify-between px-3 py-2 border-b border-border`}>
                    <JsonViewer data={output_value_json} style={{
                        fontSize: '10px'
                    }} />
                </div>
            ) : (
                <div className={`flex items-center justify-between px-3 py-2 border-b border-border`}>
                    <div className="p-3 bg-[#0d0d0d]">
                        <pre className="text-xs text-white font-mono whitespace-pre-wrap">{output_value}</pre>
                    </div>
                </div>
            )}
            {filteredAttribute && (<>
                <AccordionItem value="attributes">
                    <AccordionTrigger className={triggerClassName}>
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <FileJson className="w-4 h-4 text-blue-500" />
                                <span className="font-medium text-xs text-white">Additional Attributes</span>
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="overflow-y-auto bg-[#0a0a0a] border-t border-border p-2">
                        <JsonViewer data={filteredAttribute} style={{
                            fontSize: '10px'
                        }} />
                    </AccordionContent>
                </AccordionItem>

            </>)}
        </>
    );
}