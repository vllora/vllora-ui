
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ChatBubbleLeftRightIcon, DocumentTextIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { ADKToolViewer } from "../../adk/tool-viewer";
import { ADKLlmRequestViewer } from "../../adk/llm_request";
import { ADKLlmResponseViewer } from "../../adk/llm_response";
import { BookmarkIcon } from "lucide-react";
import { Span } from "@/types/common-type";


export const ADKInfoUIDisplay = ({ span }: { span: Span }) => {
    let currentAttribute = span.attribute as any;
    
    let toolResponseKey = 'gcp.vertex.agent.tool_response'
    let toolResponseDetail = currentAttribute?.[toolResponseKey];
    let adk_toolName = currentAttribute?.['gen_ai.tool.name'];
    let adk_toolOperationName = currentAttribute?.['gen_ai.operation.name'];
    let adk_toolDescription = currentAttribute?.['gen_ai.tool.description'];
    let adk_toolArgs = currentAttribute?.['gcp.vertex.agent.tool_call_args'];
    const triggerClassName = "px-3 py-3 hover:bg-[#1a1a1a] transition-colors";
    let span_kind = adk_toolOperationName || span.operation_name;
    let adk_llmRequest = currentAttribute?.['gcp.vertex.agent.llm_request'];
    let adk_llmResponse = currentAttribute?.['gcp.vertex.agent.llm_response'];
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
            {adk_toolName && adk_toolArgs && (<div className="border-b border-border">
                <div className="flex items-center justify-between w-full border-b border-border">
                    <div className="flex items-center gap-2 px-3 py-2">
                        <WrenchScrewdriverIcon className="w-4 h-4 text-blue-500" />
                        <span className="font-medium text-xs text-white">Tool</span>
                    </div>
                </div>
                <div className="overflow-y-auto mt-2 p-2">
                    <ADKToolViewer
                        toolName={adk_toolName}
                        toolDescription={adk_toolDescription || ''}
                        toolArgs={adk_toolArgs || {}}
                        toolResponse={toolResponseDetail || ''} />
                </div>
            </div>
            )}

            {adk_llmRequest && adk_llmRequest != '{}' && (
                <AccordionItem value="llm_request">
                    <AccordionTrigger className={triggerClassName}>
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <ChatBubbleLeftRightIcon className="w-4 h-4 text-blue-500" />
                                <span className="font-medium text-xs text-white">Request</span>
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="overflow-y-auto bg-[#0a0a0a] border-t border-border p-2">
                        <ADKLlmRequestViewer llmRequest={adk_llmRequest} />
                    </AccordionContent>
                </AccordionItem>
            )}
            {adk_llmResponse && adk_llmResponse != '{}' && (
                <AccordionItem value="llm_response">
                    <AccordionTrigger className={triggerClassName}>
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <DocumentTextIcon className="w-4 h-4 text-green-500" />
                                <span className="font-medium text-xs text-white">Response</span>
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="overflow-y-auto bg-[#0a0a0a] border-t border-border p-2">
                        <ADKLlmResponseViewer llmResponse={adk_llmResponse} />
                    </AccordionContent>
                </AccordionItem>
            )}
        </>
    )
}