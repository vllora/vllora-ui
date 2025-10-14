import React from 'react';
import { Span } from '@/types/common-type';
import {
  getSpanTitle,
  getOperationIcon,
  getOperationIconColor,
  getTimelineBgColor,
} from '@/components/chat/traces/TraceRow/new-timeline/utils';
import { useDebugSelection } from '@/contexts/DebugSelectionContext';

interface SpanItemProps {
  span: Span;
  threadStartTime: number;
  threadTotalDuration: number;
  titleWidth: number;
  variant?: 'hierarchy' | 'flat';
}

// Format duration in ms
const formatDuration = (startUs: number, endUs: number): string => {
  const durationMs = (endUs - startUs) / 1000;
  if (durationMs < 1000) {
    return `${durationMs.toFixed(0)}ms`;
  }
  return `${(durationMs / 1000).toFixed(2)}s`;
};

export const SpanItem: React.FC<SpanItemProps> = ({
  span,
  threadStartTime,
  threadTotalDuration,
  titleWidth,
  variant = 'hierarchy',
}) => {
  const { selectedSpan, setSelectedSpan } = useDebugSelection();

  // Calculate timeline visualization percentages relative to thread timeline
  const duration = span.finish_time_us - span.start_time_us;
  const clamp = (value: number, max = 100) => Math.min(max, Math.max(0, value));
  const formatPercent = (value: number) => Number(value.toFixed(3));
  const rawWidth = threadTotalDuration > 0 ? (duration / threadTotalDuration) * 100 : 0;
  const rawOffset = threadTotalDuration > 0 ? ((span.start_time_us - threadStartTime) / threadTotalDuration) * 100 : 0;
  const offsetPercent = formatPercent(clamp(rawOffset));
  const widthPercent = formatPercent(clamp(rawWidth, 100 - offsetPercent));

  // Get span display properties using utility functions
  const title = getSpanTitle({ span, relatedSpans: [] });
  const icon = getOperationIcon({ span, relatedSpans: [] });
  const iconColorClass = getOperationIconColor({ span, relatedSpans: [] });
  const timelineColor = getTimelineBgColor({ span, relatedSpans: [] });

  const containerClasses =
    variant === 'hierarchy'
      ? 'border-l-2 border-purple-500/30 ml-12 pl-4'
      : 'pl-2';

  const isSelected = selectedSpan?.span_id === span.span_id;

  return (
    <div className={containerClasses}>
      <div
        className={`flex items-start gap-2 py-1 px-2 rounded cursor-pointer transition-colors ${
          isSelected ? 'bg-accent' : 'hover:bg-accent/50'
        }`}
        onClick={() => setSelectedSpan(span)}
      >
        {/* Left panel - Fixed width with icon, title, duration */}
        <div className="flex items-center gap-2 flex-shrink-0" style={{ width: titleWidth }}>
          {/* Icon in colored circle */}
          <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${iconColorClass}`}>
            {icon}
          </div>

          {/* Title - truncated */}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-foreground/80 truncate" title={title}>
              {title}
            </div>
          </div>

          {/* Duration */}
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {formatDuration(span.start_time_us, span.finish_time_us)}
          </span>
        </div>

        {/* Right panel - Timeline visualization */}
        <div className="flex-1 min-w-0 flex items-center py-1">
          <div className="relative w-full h-5 bg-muted/10 rounded">
            <div
              className="absolute h-full rounded"
              style={{
                left: `${offsetPercent}%`,
                width: `${widthPercent}%`,
                backgroundColor: timelineColor,
                opacity: 0.8,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
