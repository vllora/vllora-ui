import React from 'react';
import { Span } from '@/types/common-type';
import {
  getOperationIcon,
  getOperationIconColor,
  getOperationTitle,
} from '@/components/chat/traces/TraceRow/new-timeline/utils';
import { StandaloneSpanUIDetailsDisplay } from './StandaloneSpanUIDetailsDisplay';
import { SpanHeader } from '../chat/traces/TraceRow/span-info/SpanHeader';

interface SpanDetailPanelProps {
  span: Span;
  relatedSpans?: Span[];
  onClose: () => void;
}
export const SpanDetailPanel: React.FC<SpanDetailPanelProps> = ({ span, relatedSpans = [], onClose }) => {
  const icon = getOperationIcon({ span, relatedSpans });
  const iconColorClass = getOperationIconColor({ span, relatedSpans });
  const operationTitle = getOperationTitle({ operation_name: span.operation_name, span });

  return (
    <div className="h-full flex flex-col bg-background border-l border-border">
      {/* Header */}
      {/* <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${iconColorClass}`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold truncate" title={title}>
              {title}
            </h2>
            <p className="text-xs text-muted-foreground">{operationTitle}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </Button>
      </div> */}
      <div className="sticky top-0 z-10 h-16 flex flex-row items-center p-1 px-1 justify-between w-full bg-[#161616] border-b border-border">
        <SpanHeader
          span={span}
          onClose={onClose}
          spanTitle={operationTitle}
          operationIcon={icon}
          operationIconColor={iconColorClass}
          closePosition="right"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-scroll flex">
        {/* Span-specific UI details */}
        <StandaloneSpanUIDetailsDisplay span={span} relatedSpans={relatedSpans} />

      </div>
    </div>
  );
};
