import { Tabs } from "@/components/ui/tabs";
// import { RenderArray } from "./utils";
// import { JsonViewer } from "./JsonViewer";
import { useState, useEffect, useCallback } from "react";
import { getModelCallSpans, getStatus, SpanUIDetailsDisplay } from "./DetailView";
import { getOperationIcon, getOperationIconColor, getSpanTitle } from "../new-timeline/utils";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { getClientSDKName, isPromptCachingApplied } from "@/utils/graph-utils";
import { SpanHeader } from "./SpanHeader";
import { SpanFooter } from "./SpanFooter";

export const SpanDetailsDisplay = () => {
  const [currentTab, setCurrentTab] = useState<string>("details");
  const { runMap, spansOfSelectedRun, setDetailSpanId, detailSpan } = ChatWindowConsumer();

  const onClose = useCallback(() => {
    setDetailSpanId(null);
  }, [setDetailSpanId]);
  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Use the obj directly as the currentSpan since it's already the selected span
  const currentSpan = detailSpan;
  let relatedSpans = runMap[currentSpan?.run_id || ''] || [];
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
 const modelCallSpan = getModelCallSpans(relatedSpans, currentSpan.span_id);
 const modelCallAttribute = modelCallSpan?.attribute as any;
 const ttf_str = modelCallAttribute?.ttft;
  return (
    <div className="w-full flex flex-col h-full">
      <Tabs value={currentTab} onValueChange={(v) => setCurrentTab(v)} className="flex flex-col h-full">
        {/* Sticky Header section */}
        <div className="sticky top-0 z-10 h-16 flex flex-row items-center p-1 px-1 justify-between w-full bg-[#161616] border-b border-border">
          <SpanHeader
            onClose={onClose}
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
            ttf_str={ttf_str}
          />
        </div>

        {/* Scrollable content container */}
        <div className="flex-1 overflow-y-auto">
            <SpanUIDetailsDisplay span={currentSpan} />
        </div>
        {/* Sticky Footer section */}
        <SpanFooter />
      </Tabs>
    </div>
  );
}
