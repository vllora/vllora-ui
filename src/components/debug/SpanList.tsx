import React from 'react';
import { Span } from '@/types/common-type';
import { HierarchyRow } from '../chat/traces/TraceRow/new-timeline/hierarchy-row';
import { TimelineHeader } from './TimelineHeader';

interface SpanListProps {
  hierarchies: Span[];
  flattenSpans: Span[];
  onSpanSelect?: (spanId: string) => void;
  selectedSpanId?: string;
}

export const SpanList: React.FC<SpanListProps> = ({ hierarchies, flattenSpans, onSpanSelect, selectedSpanId }) => {

  if (!hierarchies || Object.keys(hierarchies).length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-16 text-sm text-muted-foreground">
        No spans captured yet.
      </div>
    );
  }

  if (hierarchies.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-16 text-sm text-muted-foreground">
        No spans captured yet.
      </div>
    );
  }

  const startTime = Math.min(...flattenSpans.filter(span => span.start_time_us !== undefined).map(span => span.start_time_us));
  const endTime = Math.max(...flattenSpans.filter(span => span.finish_time_us !== undefined).map(span => span.finish_time_us || span.start_time_us));
  const totalDuration = endTime - startTime;
  const titleWidth = 200;

  return (
    <div className="flex flex-col max-h-[calc(100vh-150px)] overflow-scroll">
      <div className="sticky top-0 z-10 bg-background">
        <TimelineHeader titleWidth={titleWidth} totalDuration={totalDuration} />
      </div>

      <div className="flex flex-col gap-2">
        {Object.values(hierarchies).map((span) => {
          return <div key={span.span_id} className="border border-border rounded-sm"><HierarchyRow
            key={span.span_id}
            hierarchy={span}
            totalDuration={totalDuration}
            startTime={startTime}
            titleWidth={titleWidth}
            relatedSpans={flattenSpans}
            level={0}
            selectedSpanId={selectedSpanId}
            onSpanSelect={onSpanSelect}
          />
          </div>
        })}
      </div>
    </div>
  );
};
