import React from 'react';
import { Span } from '@/types/common-type';
import { SpanItem } from './SpanItem';
import { skipThisSpan } from '@/utils/graph-utils';

interface SpanListProps {
  spans: Span[];
}

export const SpanList: React.FC<SpanListProps> = ({ spans }) => {
  if (spans.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-16 text-sm text-muted-foreground">
        No spans captured yet.
      </div>
    );
  }

  const filteredSpans = spans.filter((span) => !skipThisSpan(span));
  if (filteredSpans.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-16 text-sm text-muted-foreground">
        No spans captured yet.
      </div>
    );
  }

  const earliestStart = Math.min(...filteredSpans.map((span) => span.start_time_us));
  const latestFinish = Math.max(...filteredSpans.map((span) => span.finish_time_us));
  const totalDuration = latestFinish - earliestStart || 1;
  const titleWidth = 200;

  return (
    <div className="flex flex-col divide-y divide-border/50">
      <div className="flex w-full px-3 py-2">
        <div style={{ width: titleWidth }} className="flex-shrink-0"></div>
        <div className="flex-grow relative ml-2">
          <div className="relative w-full h-5">
            <div className="absolute left-0 bottom-1 text-[10px] text-foreground/60 font-semibold whitespace-nowrap">
              0.0s
            </div>
            <div className="absolute left-1/4 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-foreground/60 whitespace-nowrap">
              {(totalDuration * 0.25 / 1000000).toFixed(1)}s
            </div>
            <div className="absolute left-1/2 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-foreground/60 whitespace-nowrap">
              {(totalDuration * 0.5 / 1000000).toFixed(1)}s
            </div>
            <div className="absolute left-3/4 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-foreground/60 whitespace-nowrap">
              {(totalDuration * 0.75 / 1000000).toFixed(1)}s
            </div>
            <div className="absolute right-0 bottom-1 text-right text-[10px] font-semibold text-foreground/60 whitespace-nowrap">
              {(totalDuration / 1000000).toFixed(1)}s
            </div>
          </div>
        </div>
      </div>

      {filteredSpans.map((span) => (
        <div key={span.span_id} className="pl-3">
          <SpanItem
            span={span}
            threadStartTime={earliestStart}
            threadTotalDuration={totalDuration}
            titleWidth={titleWidth}
            variant="flat"
          />
        </div>
      ))}
    </div>
  );
};
