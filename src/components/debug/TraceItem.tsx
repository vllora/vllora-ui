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

const formatDuration = (startUs: number, endUs: number): string => {
  const durationMs = (endUs - startUs) / 1000;
  if (durationMs < 1000) {
    return `${durationMs.toFixed(0)}ms`;
  }
  return `${(durationMs / 1000).toFixed(2)}s`;
};

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

  const duration = trace.finish_time_us - trace.start_time_us;
  const clamp = (value: number, max = 100) => Math.min(max, Math.max(0, value));
  const formatPercent = (value: number) => Number(value.toFixed(3));
  const rawWidth = threadTotalDuration > 0 ? (duration / threadTotalDuration) * 100 : 0;
  const rawOffset =
    threadTotalDuration > 0 ? ((trace.start_time_us - threadStartTime) / threadTotalDuration) * 100 : 0;
  const offsetPercent = formatPercent(clamp(rawOffset));
  const widthPercent = formatPercent(clamp(rawWidth, 100 - offsetPercent));

  return (
    <div className="flex flex-col">
      <div
        className="flex items-start gap-2 text-left hover:bg-muted/5 px-1 py-0.5 rounded transition cursor-pointer select-none"
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
        <span className="flex-shrink-0 pt-1 text-muted-foreground">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0" style={{ width: titleWidth }}>
          <div className="text-xs font-medium text-orange-400 truncate">Trace</div>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {formatDuration(trace.start_time_us, trace.finish_time_us)}
          </span>
        </div>
        <div className="flex-1 min-w-0 flex items-center py-1">
          <div className="relative w-full h-5 bg-muted/10 rounded">
            <div
              className="absolute h-full rounded bg-orange-500/70"
              style={{
                left: `${offsetPercent}%`,
                width: `${widthPercent}%`,
              }}
            />
          </div>
        </div>
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
