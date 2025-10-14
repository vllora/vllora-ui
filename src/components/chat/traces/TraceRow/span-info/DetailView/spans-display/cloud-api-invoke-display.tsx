import { Span } from "@/types/common-type";
import { BaseSpanUIDetailsDisplay } from ".."
import { getStatus } from "../index";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ExclamationTriangleIcon, CheckCircleIcon, ClockIcon, CpuChipIcon, CodeBracketIcon, ChatBubbleLeftRightIcon, DocumentTextIcon, WrenchScrewdriverIcon, BoltIcon } from "@heroicons/react/24/outline";
import { ErrorViewer } from "../error-viewer";
import { UsageViewer } from "../usage-viewer";
import { OutputViewer } from "../output-viewer";
import { ExtraParameters } from "../input-viewer";
import { MessageViewer } from "../message-viewer";
import { HeadersViewer } from "../headers-viewer";
import { tryParseJson } from "@/utils/modelUtils";
import { ToolInfoCall } from "./tool-display";
import { ToolDefinitionsViewer } from "../tool-definitions-viewer";
import { BasicSpanInfo } from "../basic-span-info-section";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { InputViewer } from "../input_viewer";
import { HeaderViewer } from "../header-viewer";
export const CloudApiInvokeUIDetailsDisplay = ({ span }: { span: Span }) => {
    const { spansOfSelectedRun } = ChatWindowConsumer();
    const status = getStatus(spansOfSelectedRun, span.span_id);
    const apiInvokeSpan = span
    const modelCallSpan = span
    const currentAttribute = span.attribute as any;
    const modelCallAttribute = modelCallSpan?.attribute as any;
    const apiInvokeAttribute = apiInvokeSpan?.attribute as any;
    const apiCloudInvokeAttribute = span?.attribute as any;
    const headersStr = apiCloudInvokeAttribute?.['http.request.header'];
    const headers = headersStr ? tryParseJson(headersStr) : undefined;
    const error = modelCallAttribute?.error || apiInvokeAttribute?.error;
    const output = modelCallAttribute?.response || modelCallAttribute?.output || apiInvokeAttribute?.response;
    const request = apiInvokeAttribute?.request;
    const cost_str = apiInvokeAttribute?.cost;
    const ttf_str = modelCallAttribute?.ttft;
    const usage_str = currentAttribute?.usage;
    const modelJsonStr = apiInvokeAttribute?.model || modelCallAttribute?.model;
    const modelJson = modelJsonStr ? tryParseJson(modelJsonStr) : null;
    const modelName = modelJson?.name;

    const entityByName = undefined


    const costInfo = cost_str ? tryParseJson(cost_str) : null;
    const usageInfo = usage_str ? tryParseJson(usage_str) : null;
    const inputInfo = request ? tryParseJson(request) : null;

    const triggerClassName = "px-3 py-3 hover:bg-[#1a1a1a] transition-colors";
    const keys = inputInfo && Object.keys(inputInfo);
    const hasExtraParameters = keys && keys.filter((key: string) => key !== 'messages' && key !== 'tools').length > 0;
    const messageCount = inputInfo?.messages?.length || 0;
    const parameterCount = keys?.filter((key: string) => key !== 'messages' && key !== 'tools').length || 0;

    const toolDefinitions: ToolInfoCall[] = inputInfo?.tools || [];

    return (
        <BaseSpanUIDetailsDisplay>
            
            {/* ID information section */}
            <BasicSpanInfo span={span} />

            {/* Error section - only shown when there's an error */}
            {error && (
                 <ErrorViewer error={error} />
            )}
            <div className="flex flex-col gap-6 mt-4">
                <InputViewer jsonRequest={inputInfo} headers={headers} />
            </div>
           

            {/* Output section */}
            {output && (
                <AccordionItem value="output">
                    <AccordionTrigger className={triggerClassName}>
                        <div className="flex items-center gap-2">
                            <DocumentTextIcon className="w-4 h-4 text-green-500" />
                            <span className="font-medium text-xs text-white">Output</span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="bg-[#0a0a0a] border-t border-border p-2">
                        <OutputViewer response_str={output} />
                    </AccordionContent>
                </AccordionItem>
            )}

            {/* Usage section */}
            {costInfo && <AccordionItem value="usage">
                <AccordionTrigger className={triggerClassName}>
                    <div className="flex items-center gap-2">
                        <ClockIcon className="w-4 h-4 text-teal-500" />
                        <span className="font-medium text-xs text-white">Usage & Cost</span>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="border-t border-border p-2">
                    <UsageViewer
                        cost={costInfo || undefined}
                        ttft={ttf_str || undefined}
                        usage={usageInfo || undefined}
                    />
                </AccordionContent>
            </AccordionItem>}


        </BaseSpanUIDetailsDisplay>
    );
}