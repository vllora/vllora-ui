import { Tabs, TabsContent } from "@/components/ui/tabs";
// import { RenderArray } from "./utils";
import { JsonViewer } from "./JsonViewer";
import { useState } from "react";
import { CheckCircleIcon, DatabaseIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStatus, isToolSpan, SpanUIDetailsDisplay } from "./DetailView";
import { ClientSdkIcon } from "@/components/Icons/ClientSdkIcon";
import { getOperationIcon, getOperationIconColor, getSpanTitle } from "../new-timeline/utils";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { getClientSDKName, isPromptCachingApplied } from "@/utils/graph-utils";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export const SpanDetailsDisplay = () => {
  const [currentTab, setCurrentTab] = useState<string>("details");
  const { spanMap, selectedSpanInfo, spansOfSelectedRun } = ChatWindowConsumer();
    const spanId = selectedSpanInfo?.spanId;
    const spanOrRunId = selectedSpanInfo?.runId || selectedSpanInfo?.spanId || '';

  // Use the obj directly as the currentSpan since it's already the selected span
  const currentSpan = spanOrRunId ? spanMap[spanOrRunId]?.find(span => span.span_id === spanId) : undefined;
  let relatedSpans = spanOrRunId ? spanMap[spanOrRunId] : spanMap[spanOrRunId];
  if (!currentSpan) {
    return <></>;
  }
  const operationIcon = getOperationIcon({ span: currentSpan, relatedSpans });
  const spanTitle = getSpanTitle({ span: currentSpan, relatedSpans });
  const operationIconColor = getOperationIconColor({ span: currentSpan, relatedSpans });

  // get prefix from tool_name
  let logoLink = '';
  const sdkName = currentSpan && getClientSDKName(currentSpan);
  const isPromptCached = currentSpan && isPromptCachingApplied(currentSpan);
  const status = currentSpan && getStatus(spansOfSelectedRun, currentSpan.span_id);
  const isSuccessStatus = status && ['200', 200].includes(status);
  return (
    <div className="w-full flex flex-col h-full">
      <Tabs value={currentTab} onValueChange={(v) => setCurrentTab(v)} className="flex flex-col h-full">
        {/* Sticky Header section */}
        <div className="sticky top-0 z-10 flex flex-row items-center p-2 px-4 justify-between w-full bg-[#161616] border-b border-border">
          <div className="flex flex-row items-center gap-4 justify-between w-full">
            <div className="flex items-center gap-2">
              {logoLink ? <img src={logoLink} alt={spanTitle} width={20} height={20} /> : <>
                <div className="relative">
                  <div className={cn("p-1 rounded-full ", operationIconColor)}>
                    {operationIcon}
                  </div>
                  {sdkName && (
                    <div className="absolute -bottom-1 -right-1  bg-gray-800 rounded-full p-0.5 border border-gray-700 shadow-sm">
                      <ClientSdkIcon client_name={sdkName} className="w-2.5 h-2.5" />
                    </div>
                  )}
                  {/* Cache indicator as subscript icon */}
                  {currentSpan.operation_name === 'cache' && (
                    <div className="absolute -bottom-1 -right-1 bg-gray-800 rounded-full p-0.5 border border-gray-700 shadow-sm">
                      <DatabaseIcon className="w-2.5 h-2.5 text-blue-400" />
                    </div>
                  )}
                  {/* Prompt caching indicator as subscript icon */}
                  {isPromptCached && (
                    <div className="absolute -bottom-1 -right-1 bg-gray-800 rounded-full p-0.5 border border-gray-700 shadow-sm">
                      <DatabaseIcon className="w-2.5 h-2.5 text-amber-400" />
                    </div>
                  )}
                </div>
              </>}
              <h3 className="text-xs font-medium text-white hover:cursor-help">{spanTitle}</h3>
            </div>
             {status && (
                            <div className={`flex items-center px-2 py-1 rounded-md text-xs ${isSuccessStatus? ' text-green-500' : 'text-red-500'}`}>
                                {isSuccessStatus ? (
                                    <CheckCircleIcon className="w-3 h-3 mr-1" />
                                ) : (
                                    <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
                                )}
                                { isSuccessStatus ? 'Success' : 'Failed'}
                            </div>
                        )}
          </div>
         
        </div>

        {/* Scrollable content container */}
        <div className="flex-1 overflow-y-auto">
          {/* Tabs content */}
          <TabsContent value="json" className="p-2 h-full">
            <JsonViewer data={currentSpan} style={{ fontSize: '10px' }} />
          </TabsContent>
          <TabsContent value="details" className="p-2 h-full">
            <SpanUIDetailsDisplay span={currentSpan} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
