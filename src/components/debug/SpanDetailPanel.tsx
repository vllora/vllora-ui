import React from 'react';
import { Span } from '@/types/common-type';
import {
  getOperationIcon,
  getOperationIconColor,
  getSpanTitle,
} from '@/components/chat/traces/TraceRow/new-timeline/utils';
import { StandaloneSpanUIDetailsDisplay } from './StandaloneSpanUIDetailsDisplay';
import { SpanHeader } from '../chat/traces/TraceRow/span-info/SpanHeader';
import { getClientSDKName } from '@/utils/graph-utils';
import { getModelCallSpans, getStatus } from '../chat/traces/TraceRow/span-info/DetailView';

interface SpanDetailPanelProps {
  span: Span;
  relatedSpans?: Span[];
  onClose: () => void;
}
export const SpanDetailPanel: React.FC<SpanDetailPanelProps> = ({ span, relatedSpans = [], onClose }) => {
  const icon = getOperationIcon({ span, relatedSpans });
  const iconColorClass = getOperationIconColor({ span, relatedSpans });
  const spanTitle = getSpanTitle({ span, relatedSpans });
  const sdkName = span && getClientSDKName(span);
  const status = span && getStatus(relatedSpans, span.span_id);
  const modelCallSpan = getModelCallSpans(relatedSpans, span.span_id);
  const modelCallAttribute = modelCallSpan?.attribute as any;
  const ttf_str = modelCallAttribute?.ttft;
  return (
    <div className="h-full flex flex-col bg-background border-l border-border">
      <div className="sticky top-0 z-10 h-16 flex flex-row items-center p-1 px-1 justify-between w-full bg-[#161616] border-b border-border">
        <SpanHeader
          span={span}
          onClose={onClose}
          spanTitle={spanTitle}
          operationIcon={icon}
          operationIconColor={iconColorClass}
          closePosition="right"
          sdkName={sdkName}
          status={status}
          startTime={span.start_time_us}
          endTime={span.finish_time_us}
          ttf_str={ttf_str}
        />
      </div>
      <StandaloneSpanUIDetailsDisplay span={span} relatedSpans={relatedSpans} />

    </div>
  );
};
