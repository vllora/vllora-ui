import React from 'react';
import { PlayCircle } from 'lucide-react';
import { DebugRun } from '@/hooks/events/useDebugTimeline';
import { TraceItem } from './TraceItem';

interface RunItemProps {
  run: DebugRun;
}

// Format duration in ms
const formatDuration = (startUs: number, endUs: number): string => {
  const durationMs = (endUs - startUs) / 1000;
  if (durationMs < 1000) {
    return `${durationMs.toFixed(0)}ms`;
  }
  return `${(durationMs / 1000).toFixed(2)}s`;
};

export const RunItem: React.FC<RunItemProps> = ({ run }) => {
  const totalSpans = run.traces.reduce((sum, trace) => sum + trace.spans.length, 0);
  const totalTraces = run.traces.length;

  return (
    <div className="border-l-2 border-blue-500/30 ml-4 pl-4">
      <div className="flex items-center gap-2 py-2 hover:bg-accent/5 rounded px-2">
        <PlayCircle className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-mono text-blue-400">
          Run: {run.run_id?.substring(0, 8)}
        </span>
        <span className="text-xs text-muted-foreground">
          {run.used_models.length > 0 && `${run.used_models[0]}`}
        </span>
        <div className="ml-auto flex items-center gap-3 text-xs">
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
          <span className="text-muted-foreground">
            {formatDuration(run.start_time_us, run.finish_time_us)}
          </span>
        </div>
      </div>

      {run.traces.length > 0 && (
        <div className="mt-1">
          {run.traces
            .sort((a, b) => b.start_time_us - a.start_time_us)
            .map((trace) => (
              <TraceItem key={trace.trace_id} trace={trace} />
            ))}
        </div>
      )}
    </div>
  );
};
