import React from 'react';
import { PlayCircle } from 'lucide-react';
import { DebugRun } from '@/hooks/events/useDebugTimeline';
import { TraceItem } from './TraceItem';

interface RunItemProps {
  run: DebugRun;
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

export const RunItem: React.FC<RunItemProps> = ({ run, threadStartTime, threadTotalDuration, titleWidth }) => {
  const totalSpans = run.traces.reduce((sum, trace) => sum + trace.spans.length, 0);
  const totalTraces = run.traces.length;

  // Calculate timeline visualization percentages relative to thread timeline
  const duration = run.finish_time_us - run.start_time_us;
  const widthPercent = threadTotalDuration > 0 ? (duration / threadTotalDuration) * 100 : 0;
  const offsetPercent = threadTotalDuration > 0 ? ((run.start_time_us - threadStartTime) / threadTotalDuration) * 100 : 0;

  return (
    <div className="border-l-2 border-blue-500/30 ml-4 pl-4">
      <div className="flex items-start gap-2 py-1">
        {/* Left panel - Fixed width with run info */}
        <div className="flex items-center gap-2 flex-shrink-0" style={{ width: titleWidth }}>
          <PlayCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-mono text-blue-400 truncate">
              Run: {run.run_id?.substring(0, 8)}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {run.used_models.length > 0 && `${run.used_models[0]}`}
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {formatDuration(run.start_time_us, run.finish_time_us)}
          </span>
        </div>

        {/* Right panel - Timeline visualization */}
        <div className="flex-1 min-w-0 flex items-center py-1">
          <div className="relative w-full h-6 bg-muted/10 rounded">
            <div
              className="absolute h-full rounded bg-blue-500"
              style={{
                left: `${offsetPercent}%`,
                width: `${widthPercent}%`,
                opacity: 0.6,
              }}
            />
          </div>
        </div>
      </div>

      {/* Metrics row */}
      <div className="flex items-center gap-3 text-xs ml-8 mb-1">
        {totalTraces > 0 && (
          <span className="text-orange-400">{totalTraces} traces</span>
        )}
        {totalSpans > 0 && (
          <span className="text-purple-400">{totalSpans} spans</span>
        )}
        {run.cost > 0 && (
          <span className="text-green-400">${run.cost.toFixed(6)}</span>
        )}
        {(run.input_tokens > 0 || run.output_tokens > 0) && (
          <span className="text-cyan-400">
            {run.input_tokens + run.output_tokens} tokens
          </span>
        )}
      </div>

      {run.traces.length > 0 && (
        <div className="mt-1">
          {run.traces
            .sort((a, b) => b.start_time_us - a.start_time_us)
            .map((trace) => (
              <TraceItem
                key={trace.trace_id}
                trace={trace}
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
