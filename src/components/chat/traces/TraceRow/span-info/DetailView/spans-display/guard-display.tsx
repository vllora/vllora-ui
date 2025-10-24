import { Span } from "@/types/common-type";
import { BaseSpanUIDetailsDisplay } from "..";
import { ShieldCheckIcon, ShieldExclamationIcon, DocumentTextIcon, BoltIcon } from "@heroicons/react/24/outline";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { JsonViewer } from "../../JsonViewer";
import { tryParseJson } from "@/utils/modelUtils";
import { cn } from "@/lib/utils";

export interface ResultGuardAtt {
    Ok?: {
        confidence: number;
        passed: boolean;
    };
    confidence?: number;
    passed?: boolean;
}

export const GuardUIDetailsDisplay = ({ span }: { span: Span }) => {
    const currentSpan = span;
    const attribute = currentSpan.attribute as any;
    const result = attribute.result;
    const jsonResult = tryParseJson(result) as ResultGuardAtt;
    const userInput: string = attribute.user_input;
    const jsonUserInput = tryParseJson(userInput) as { [key: string]: any };
    const guardType = attribute && attribute['r#type'];
    const isSuccess = jsonResult && (jsonResult.passed ?? jsonResult.Ok?.passed);
    const start_time_us = currentSpan.start_time_us;
    const finish_time_us = currentSpan.finish_time_us;
    const duration = finish_time_us ? finish_time_us - start_time_us : 0;
    const confidence = jsonResult?.Ok?.confidence ?? jsonResult?.confidence;
    const result_metadata_str = attribute.result_metadata;
    const result_metadata = tryParseJson(result_metadata_str) as { [key: string]: any };
    const durationCalculated = (duration / 1000000).toFixed(2);
    const durationStr = `${durationCalculated == '0.00' ? '<0.01' : durationCalculated}s`;
    const triggerClassName = "px-3 py-3 hover:bg-[#1a1a1a] transition-colors";
    return (
        <BaseSpanUIDetailsDisplay>
            {/* Header section with guard info and status */}
            <div className="flex flex-col gap-2 p-3 border-b border-border rounded-t-md">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BoltIcon className="h-3.5 w-3.5 text-white" />
                        <span className="text-xs text-white">Status</span>
                    </div>

                    <div className={`flex items-center px-2 py-1 rounded-md text-xs ${isSuccess ? 'bg-[#1a2e1a] text-green-500 border border-green-800' : 'bg-[#2e1a1a] text-red-500 border border-red-800'}`}>
                        {isSuccess ? (
                            <ShieldCheckIcon className="w-3 h-3 mr-1" />
                        ) : (
                            <ShieldExclamationIcon className="w-3 h-3 mr-1" />
                        )}
                        {isSuccess ? "Passed" : "Failed"}
                    </div>
                </div>


            </div>
            {/* User Input section */}
            {jsonUserInput && Object.keys(jsonUserInput).length > 0 && (
                <AccordionItem value="user_input">
                    <AccordionTrigger className={triggerClassName}>
                        <div className="flex items-center gap-2">
                            <DocumentTextIcon className="w-4 h-4 text-blue-500" />
                            <span className="font-medium text-xs text-white">User Input</span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="bg-[#0a0a0a] border-t border-border p-2">
                        <div className="flex flex-col gap-2">
                            {Object.entries(jsonUserInput).map(([key, value]) => (
                                <div key={key} className="flex flex-col gap-1 bg-[#111111] p-2 rounded-md border border-border">
                                    <span className="text-xs font-medium text-gray-300">{key}</span>
                                    <span className="text-xs text-gray-400 font-mono break-all">
                                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </AccordionContent>
                </AccordionItem>
            )}

            {/* Result details section */}
            {jsonUserInput && Object.keys(jsonUserInput).length > 0 && <AccordionItem value="result">
                <AccordionTrigger className={triggerClassName}>
                    <div className="flex items-center gap-2">
                        <ShieldCheckIcon className={cn("w-4 h-4", isSuccess ? "text-green-500" : "text-red-500")} />
                        <span className="font-medium text-xs text-white">Result</span>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="bg-[#0a0a0a] border-t border-border p-2">
                    <div className="flex flex-col gap-3">
                        {guardType && (
                            <div className="flex items-center justify-between p-2 bg-[#111111] rounded-md border border-border">
                                <span className="text-xs text-gray-300">Guard Type</span>
                                <span className="text-xs font-medium text-white">{guardType}</span>
                            </div>
                        )}
                        {confidence !== undefined && (
                            <div className="flex items-center justify-between p-2 bg-[#111111] rounded-md border border-border">
                                <span className="text-xs text-gray-300">Confidence Score</span>
                                <span className="text-xs font-medium text-white">{confidence.toFixed(3) === '0.000' ? '<0.001' : `${confidence.toFixed(3)}`}</span>
                            </div>
                        )}

                        <div className="flex items-center justify-between p-2 bg-[#111111] rounded-md border border-border">
                            <span className="text-xs text-gray-300">Processing Time</span>
                            <span className="text-xs font-medium text-white">{durationStr}</span>
                        </div>
                        {result_metadata && <div className="flex flex-col gap-2 bg-[#111111] p-2 mx-2 rounded-md border border-border">
                            <span className="text-xs font-medium text-gray-300">Details</span>
                            <div className="text-[10px]">
                                <JsonViewer data={result_metadata} />
                            </div>
                        </div>}
                    </div>
                </AccordionContent>
            </AccordionItem>}
            {!jsonUserInput || Object.keys(jsonUserInput).length === 0 && <>
                <div className="flex items-center gap-2 px-3 py-2">
                    <ShieldCheckIcon className={cn("w-4 h-4", isSuccess ? "text-green-500" : "text-red-500")} />
                    <span className="font-medium text-xs text-white">Result</span>
                </div>
                <div className="bg-[#0a0a0a] border-t border-border p-2">
                    <div className="flex flex-col gap-3">
                        {guardType && (
                            <div className="flex items-center justify-between p-2 bg-[#111111] rounded-md border border-border">
                                <span className="text-xs text-gray-300">Guard Type</span>
                                <span className="text-xs font-medium text-white">{guardType}</span>
                            </div>
                        )}
                        {confidence !== undefined && (
                            <div className="flex items-center justify-between p-2 bg-[#111111] rounded-md border border-border">
                                <span className="text-xs text-gray-300">Confidence Score</span>
                                <span className="text-xs font-medium text-white">{confidence.toFixed(3) === '0.000' ? '<0.001' : `${confidence.toFixed(3)}`}</span>
                            </div>
                        )}

                        <div className="flex items-center justify-between p-2 bg-[#111111] rounded-md border border-border">
                            <span className="text-xs text-gray-300">Processing Time</span>
                            <span className="text-xs font-medium text-white">{durationStr}</span>
                        </div>
                    </div>
                </div>
                {result_metadata && <div className="flex flex-col gap-2 bg-[#111111] p-2 mx-2 rounded-md border border-border">
                    <span className="text-xs font-medium text-gray-300">Details</span>
                    <div className="text-[10px]">
                        <JsonViewer data={result_metadata} />
                    </div>
                </div>}
            </>}


        </BaseSpanUIDetailsDisplay>
    );
}
