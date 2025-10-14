import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DebugTrace } from '@/hooks/events/useDebugTimeline';
import { SpanItem } from './SpanItem';
import { skipThisSpan } from '@/utils/graph-utils';
import { convertToHierarchy } from '@/contexts/RunDetailContext';
import { HierarchyRow } from '../chat/traces/TraceRow/new-timeline/hierarchy-row';

interface TraceItemProps {
  trace: DebugTrace;
  titleWidth: number;
  selectedSpanId?: string;
  onSpanSelect?: (spanId: string) => void;
  totalDuration: number;
  startTime: number;
  endTime: number;
}

export const TraceItem: React.FC<TraceItemProps> = ({
  trace,
  titleWidth,
  selectedSpanId,
  onSpanSelect,
  totalDuration,
  startTime,
  }) => {

  const sortedSpans = [...trace.spans].sort((a, b) => a.start_time_us - b.start_time_us).filter((span) => !skipThisSpan(span));
  const hierarchies = convertToHierarchy({ spans: sortedSpans, isDisplayGraph: false });
  return (
    <div key={`${trace.trace_id}`} className="border border-border/70 rounded-md">

      <div className="flex flex-col divide-y divide-border">
        {Object.values(hierarchies).map((hierarchy) => {
           

          return <HierarchyRow
            key={hierarchy.root.span_id}
            hierarchy={hierarchy}
            totalDuration={totalDuration}
            startTime={startTime}
            titleWidth={titleWidth}
            relatedSpans={sortedSpans}
            level={0}
            selectedSpanId={selectedSpanId}
            onSpanSelect={onSpanSelect}
          />
        })}
      </div>

    </div>
  );
};
