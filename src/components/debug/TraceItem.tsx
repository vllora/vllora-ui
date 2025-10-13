import React from 'react';
import { GitBranch } from 'lucide-react';
import { DebugTrace } from '@/hooks/events/useDebugTimeline';
import { SpanItem } from './SpanItem';

interface TraceItemProps {
  trace: DebugTrace;
  threadStartTime: number;
  threadTotalDuration: number;
  titleWidth: number;
}

// Format duration in ms
const formatDuration = (startUs: number, endUs: number): string => {
  const durationMs = (endUs - startUs) / 1000;
  if (durationMs < 1000) {
    return `${durationMs.toFixed(0)}ms`;
  }
  return `${(durationMs / 1000).toFixed(2)}s`;
};

export const TraceItem: React.FC<TraceItemProps> = ({ trace, threadStartTime, threadTotalDuration, titleWidth }) => {
  // Calculate timeline visualization percentages relative to thread timeline
  const duration = trace.finish_time_us - trace.start_time_us;
  const widthPercent = threadTotalDuration > 0 ? (duration / threadTotalDuration) * 100 : 0;
  const offsetPercent = threadTotalDuration > 0 ? ((trace.start_time_us - threadStartTime) / threadTotalDuration) * 100 : 0;

  return (
    <div className="border-l-2 border-orange-500/30 ml-8 pl-4">
      <div className="flex items-start gap-2 py-1">
        {/* Left panel - Fixed width with trace info */}
        <div className="flex items-center gap-2 flex-shrink-0" style={{ width: titleWidth }}>
          <GitBranch className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-mono text-orange-400 truncate block">
              Trace: {trace.trace_id?.substring(0, 8)}
            </span>
            <span className="text-[10px] text-purple-400">
              {trace.spans.length} spans
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {formatDuration(trace.start_time_us, trace.finish_time_us)}
          </span>
        </div>

        {/* Right panel - Timeline visualization */}
        <div className="flex-1 min-w-0 flex items-center py-1">
          <div className="relative w-full h-5 bg-muted/10 rounded">
            <div
              className="absolute h-full rounded bg-orange-500"
              style={{
                left: `${offsetPercent}%`,
                width: `${widthPercent}%`,
                opacity: 0.6,
              }}
            />
          </div>
        </div>
      </div>

      {trace.spans.length > 0 && (
        <div className="mt-1">
          {trace.spans
            .sort((a, b) => a.start_time_us - b.start_time_us)
            .map((span) => (
              <SpanItem
                key={span.span_id}
                span={span}
                threadStartTime={threadStartTime}
                threadTotalDuration={threadTotalDuration}
                titleWidth={titleWidth}
              />
            ))}
        </div>
      )}
    </div>
  );
};
