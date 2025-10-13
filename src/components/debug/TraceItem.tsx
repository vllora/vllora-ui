import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DebugTrace } from '@/hooks/events/useDebugTimeline';
import { SpanItem } from './SpanItem';

interface TraceItemProps {
  trace: DebugTrace;
  threadStartTime: number;
  threadTotalDuration: number;
  titleWidth: number;
  defaultExpanded?: boolean;
}

export const TraceItem: React.FC<TraceItemProps> = ({
  trace,
  threadStartTime,
  threadTotalDuration,
  titleWidth,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded, trace.trace_id]);

  const sortedSpans = [...trace.spans].sort((a, b) => a.start_time_us - b.start_time_us);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center gap-2 text-left hover:bg-muted/5 px-1 py-0.5 rounded transition cursor-pointer select-none"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
      >
        <span className="flex-shrink-0 text-muted-foreground">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <span className="text-xs text-muted-foreground/80">Trace spans</span>
        <span className="sr-only">
          {isExpanded ? 'Collapse trace spans' : 'Expand trace spans'}
        </span>
      </div>

      {isExpanded &&
        sortedSpans.map((span) => (
          <SpanItem
            key={span.span_id}
            span={span}
            threadStartTime={threadStartTime}
            threadTotalDuration={threadTotalDuration}
            titleWidth={titleWidth}
          />
        ))}
    </div>
  );
};
