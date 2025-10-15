import { Tabs, TabsContent } from "@/components/ui/tabs";
// import { RenderArray } from "./utils";
import { JsonViewer } from "./JsonViewer";
import { useState } from "react";
import { getStatus, SpanUIDetailsDisplay } from "./DetailView";
import { getOperationIcon, getOperationIconColor, getSpanTitle } from "../new-timeline/utils";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { getClientSDKName, isPromptCachingApplied } from "@/utils/graph-utils";
import { SpanHeader } from "./SpanHeader";

export const SpanDetailsDisplay = () => {
  const [currentTab, setCurrentTab] = useState<string>("details");
  const { spanMap, selectedSpanId, selectedRunId, spansOfSelectedRun, setSelectedSpanId } = ChatWindowConsumer();
    const spanId = selectedSpanId;
    const spanOrRunId = selectedRunId || selectedSpanId || '';

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

  return (
    <div className="w-full flex flex-col h-full">
      <Tabs value={currentTab} onValueChange={(v) => setCurrentTab(v)} className="flex flex-col h-full">
        {/* Sticky Header section */}
        <div className="sticky top-0 z-10 flex flex-row items-center p-2 px-4 justify-between w-full bg-[#161616] border-b border-border">
          <SpanHeader
            onClose={()=> {
              setSelectedSpanId(null);
            }}
            logoLink={logoLink}
            spanTitle={spanTitle}
            operationIcon={operationIcon}
            operationIconColor={operationIconColor}
            sdkName={sdkName}
            operationName={currentSpan.operation_name}
            isPromptCached={isPromptCached}
            status={status}
            startTime={currentSpan.start_time_us}
            endTime={currentSpan.finish_time_us}
            span={currentSpan}
          />
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
