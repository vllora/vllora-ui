import { BookmarkIcon, FileJson } from "lucide-react";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Span } from "@/types/common-type";
import { JsonViewer } from "../../../JsonViewer";


export const CrewAIInfoUIDisplay = ({ span }: { span: Span }) => {
    let attribute = span.attribute as any;
    let span_kind = attribute?.['openinference.span.kind'];
    const triggerClassName = "px-3 py-3 hover:bg-[#1a1a1a] transition-colors";
    let filterOutAttributes = ['langdb_client_name', 'vllora.client_name'];
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
            {filteredAttribute && (<>
                <AccordionItem value="attributes">
                    <AccordionTrigger className={triggerClassName}>
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <FileJson className="w-4 h-4 text-blue-500" />
                                <span className="font-medium text-xs text-white">Attributes</span>
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