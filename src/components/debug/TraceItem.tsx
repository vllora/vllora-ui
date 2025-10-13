import React from 'react';
import { GitBranch } from 'lucide-react';
import { DebugTrace } from '@/hooks/events/useDebugTimeline';
import { SpanItem } from './SpanItem';

interface TraceItemProps {
  trace: DebugTrace;
}

// Format duration in ms
const formatDuration = (startUs: number, endUs: number): string => {
  const durationMs = (endUs - startUs) / 1000;
  if (durationMs < 1000) {
    return `${durationMs.toFixed(0)}ms`;
  }
  return `${(durationMs / 1000).toFixed(2)}s`;
};

export const TraceItem: React.FC<TraceItemProps> = ({ trace }) => {
  // Calculate total duration and min start time for timeline visualization
  const totalDuration = trace.finish_time_us - trace.start_time_us;
  const minStartTime = trace.start_time_us;

  return (
    <div className="border-l-2 border-orange-500/30 ml-8 pl-4">
      <div className="flex items-center gap-2 py-2 hover:bg-accent/5 rounded px-2">
        <GitBranch className="w-3.5 h-3.5 text-orange-400" />
        <span className="text-xs font-mono text-orange-400">
          Trace: {trace.trace_id?.substring(0, 8)}
        </span>
        <div className="ml-auto flex items-center gap-3 text-xs">
          {trace.spans.length > 0 && (
            <span className="text-purple-400">{trace.spans.length} spans</span>
          )}
          <span className="text-muted-foreground">
            {formatDuration(trace.start_time_us, trace.finish_time_us)}
          </span>
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
                totalDuration={totalDuration}
                minStartTime={minStartTime}
              />
            ))}
        </div>
      )}
    </div>
  );
};
