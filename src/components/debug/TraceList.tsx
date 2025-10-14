import React from 'react';
import { DebugTrace } from '@/hooks/events/useDebugTimeline';
import { TraceItem } from './TraceItem';
import { TimelineHeader } from './TimelineHeader';

interface TraceListProps {
  traces: DebugTrace[];
  selectedSpanId?: string;
  onSpanSelect?: (spanId: string) => void;
}

export const TraceList: React.FC<TraceListProps> = ({ traces, selectedSpanId, onSpanSelect }) => {
  if (traces.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium">No traces to display</p>
          <p className="text-sm mt-1">Waiting for activity...</p>
        </div>
      </div>
    );
  }

  // Calculate global timeline bounds
  const sortedTraces = [...traces].sort((a, b) => a.start_time_us - b.start_time_us);
  const globalStartTime = sortedTraces.length > 0
    ? Math.min(...sortedTraces.map(trace => trace.start_time_us))
    : 0;
  const globalEndTime = sortedTraces.length > 0
    ? Math.max(...sortedTraces.map(trace => trace.finish_time_us))
    : 0;
  const globalTotalDuration = globalEndTime - globalStartTime || 1;
  const titleWidth = 180;

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 bg-background">
        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/50 bg-muted/20">
          Showing {traces.length} trace{traces.length !== 1 ? 's' : ''}
        </div>

        {/* Timeline header with ticks */}
        <TimelineHeader titleWidth={titleWidth} totalDuration={globalTotalDuration} />
      </div>

      <div className="flex flex-col gap-2 p-2">
        {sortedTraces.map((trace) => (
          <TraceItem
            key={trace.trace_id}
            trace={trace}
            totalDuration={globalTotalDuration}
            startTime={globalStartTime}
            endTime={globalEndTime}
            titleWidth={titleWidth}
            selectedSpanId={selectedSpanId}
            onSpanSelect={onSpanSelect}
          />
        ))}
      </div>
    </div>
  );
};
