import React from 'react';
import { MessageSquare } from 'lucide-react';
import { DebugThread } from '@/hooks/events/useDebugTimeline';
import { RunItem } from './RunItem';

interface ThreadItemProps {
  thread: DebugThread;
}

// Format time helper
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const timeStr = date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${timeStr}.${ms}`;
};

export const ThreadItem: React.FC<ThreadItemProps> = ({ thread }) => {
  const totalRuns = thread.runs.length;
  const totalTraces = thread.runs.reduce((sum, run) => sum + run.traces.length, 0);
  const totalSpans = thread.runs.reduce(
    (sum, run) => sum + run.traces.reduce((traceSum, trace) => traceSum + trace.spans.length, 0),
    0
  );
  const totalCost = thread.runs.reduce((sum, run) => sum + run.cost, 0);
  const totalTokens = thread.runs.reduce(
    (sum, run) => sum + run.input_tokens + run.output_tokens,
    0
  );

  return (
    <div className="border-b border-border/50">
      <div className="flex items-center gap-2 p-3 hover:bg-accent/5">
        <MessageSquare className="w-5 h-5 text-green-400" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {thread.title || `Thread ${thread.id.substring(0, 8)}`}
            </span>
            <span className="text-xs font-mono text-muted-foreground">
              {thread.id.substring(0, 8)}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="font-mono">{formatTime(thread.lastActivity)}</span>
            {totalRuns > 0 && <span className="text-blue-400">{totalRuns} runs</span>}
            {totalTraces > 0 && <span className="text-orange-400">{totalTraces} traces</span>}
            {totalSpans > 0 && <span className="text-purple-400">{totalSpans} spans</span>}
            {totalCost > 0 && <span className="text-green-400">${totalCost.toFixed(6)}</span>}
            {totalTokens > 0 && <span className="text-cyan-400">{totalTokens} tokens</span>}
          </div>
        </div>
      </div>

      {thread.runs.length > 0 && (
        <div className="pb-2">
          {thread.runs
            .sort((a, b) => b.start_time_us - a.start_time_us)
            .map((run) => (
              <RunItem key={run.run_id} run={run} />
            ))}
        </div>
      )}
    </div>
  );
};
