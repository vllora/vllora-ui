import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import { DebugThread } from '@/hooks/events/useDebugTimeline';
import { RunItem } from './RunItem';

interface ThreadItemProps {
  thread: DebugThread;
  defaultExpanded?: boolean;
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

export const ThreadItem: React.FC<ThreadItemProps> = ({ thread, defaultExpanded = false }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded, thread.id]);

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

  // Calculate thread timeline bounds from all runs
  const threadStartTime = thread.runs.length > 0
    ? Math.min(...thread.runs.map(run => run.start_time_us))
    : 0;
  const threadEndTime = thread.runs.length > 0
    ? Math.max(...thread.runs.map(run => run.finish_time_us))
    : 0;
  const threadTotalDuration = threadEndTime - threadStartTime;

  const titleWidth = 180; // Fixed width for left panel
  const sortedRuns = [...thread.runs].sort((a, b) => b.start_time_us - a.start_time_us);

  return (
    <div className="border-b border-border/50">
      <button
        type="button"
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/5 transition"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
      >
        <span className="flex-shrink-0 text-muted-foreground">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <MessageSquare className="w-5 h-5 text-green-400 flex-shrink-0" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {thread.title || `Thread ${thread.id.substring(0, 8)}`}
            </span>
            <span className="text-xs font-mono text-muted-foreground">
              {thread.id.substring(0, 8)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
            <span className="font-mono">{formatTime(thread.lastActivity)}</span>
            {totalRuns > 0 && <span className="text-blue-400">{totalRuns} runs</span>}
            {totalTraces > 0 && <span className="text-orange-400">{totalTraces} traces</span>}
            {totalSpans > 0 && <span className="text-purple-400">{totalSpans} spans</span>}
            {totalCost > 0 && <span className="text-green-400">${totalCost.toFixed(6)}</span>}
            {totalTokens > 0 && <span className="text-cyan-400">{totalTokens} tokens</span>}
          </div>
        </div>
      </button>

      {isExpanded && thread.runs.length > 0 && (
        <div className="pb-2">
          {/* Timeline header with ticks */}
          <div className="flex w-full px-3 mb-2">
            <div style={{ width: titleWidth }} className="flex-shrink-0"></div>
            <div className="flex-grow relative ml-2">
              <div className="relative w-full h-5">
                {/* Time markers */}
                <div className="absolute left-0 bottom-1 text-[10px] text-foreground/60 font-semibold whitespace-nowrap">
                  0.0s
                </div>
                <div className="absolute left-1/4 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-foreground/60 whitespace-nowrap">
                  {(threadTotalDuration * 0.25 / 1000000).toFixed(1)}s
                </div>
                <div className="absolute left-1/2 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-foreground/60 whitespace-nowrap">
                  {(threadTotalDuration * 0.5 / 1000000).toFixed(1)}s
                </div>
                <div className="absolute left-3/4 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-foreground/60 whitespace-nowrap">
                  {(threadTotalDuration * 0.75 / 1000000).toFixed(1)}s
                </div>
                <div className="absolute right-0 bottom-1 text-right text-[10px] font-semibold text-foreground/60 whitespace-nowrap">
                  {(threadTotalDuration / 1000000).toFixed(1)}s
                </div>
              </div>
            </div>
          </div>

          {/* Runs with timeline visualization */}
          {sortedRuns.map((run, runIndex) => (
              <RunItem
                key={run.run_id}
                run={run}
                threadStartTime={threadStartTime}
                threadTotalDuration={threadTotalDuration}
                titleWidth={titleWidth}
                defaultExpanded={runIndex === 0}
              />
            ))}
        </div>
      )}
    </div>
  );
};
