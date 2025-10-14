import React from 'react';
import { skipThisSpan } from '@/utils/graph-utils';
import { Hierarchy } from '@/contexts/RunDetailContext';
import { Span } from '@/types/common-type';
import { HierarchyRow } from '../chat/traces/TraceRow/new-timeline/hierarchy-row';
import { TimelineHeader } from './TimelineHeader';

interface SpanListProps {
  hierarchies: Record<string, Hierarchy>;
  spans: Span[];
  onSpanSelect?: (spanId: string) => void;
  selectedSpanId?: string;
}

export const SpanList: React.FC<SpanListProps> = ({ hierarchies, spans, onSpanSelect, selectedSpanId }) => {
  if (!hierarchies || Object.keys(hierarchies).length === 0) {
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

   const startTime = Math.min(...spans.map(span => span.start_time_us));
    const endTime = Math.max(...spans.map(span => span.finish_time_us));
    const totalDuration = endTime - startTime;
  const titleWidth = 200;

  return (
    <div className="flex flex-col divide-y divide-border/50">
      <TimelineHeader titleWidth={titleWidth} totalDuration={totalDuration} />

      <div className="flex flex-col divide-y divide-border">
      {Object.values(hierarchies).map((hierarchy) => {
        return <HierarchyRow
          key={hierarchy.root.span_id}
          hierarchy={hierarchy}
          totalDuration={totalDuration}
          startTime={startTime}
          titleWidth={titleWidth}
          relatedSpans={spans}
          level={0}
          selectedSpanId={selectedSpanId}
          onSpanSelect={onSpanSelect}
        />})}
      </div>
    </div>
  );
};
