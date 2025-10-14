import React from 'react';
import { DebugRun } from '@/hooks/events/useDebugTimeline';
import { RunItem } from './RunItem';

interface RunListProps {
  runs: DebugRun[];
}

export const RunList: React.FC<RunListProps> = ({ runs }) => {
  if (runs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium">No runs to display</p>
          <p className="text-sm mt-1">Waiting for activity...</p>
        </div>
      </div>
    );
  }

  // Calculate global timeline bounds
  const sortedRuns = [...runs].sort((a, b) => a.start_time_us - b.start_time_us);
  const globalStartTime = sortedRuns.length > 0
    ? Math.min(...sortedRuns.map(run => run.start_time_us))
    : 0;
  const globalEndTime = sortedRuns.length > 0
    ? Math.max(...sortedRuns.map(run => run.finish_time_us))
    : 0;
  const globalTotalDuration = globalEndTime - globalStartTime || 1;
  const titleWidth = 180;

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/50 bg-muted/20">
        Showing {runs.length} run{runs.length !== 1 ? 's' : ''}
      </div>

      {/* Timeline header with ticks */}
      <div className="flex w-full px-3 py-2">
        <div style={{ width: titleWidth }} className="flex-shrink-0"></div>
        <div className="flex-grow relative ml-2">
          <div className="relative w-full h-5">
            <div className="absolute left-0 bottom-1 text-[10px] text-foreground/60 font-semibold whitespace-nowrap">
              0.0s
            </div>
            <div className="absolute left-1/4 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-foreground/60 whitespace-nowrap">
              {(globalTotalDuration * 0.25 / 1000000).toFixed(1)}s
            </div>
            <div className="absolute left-1/2 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-foreground/60 whitespace-nowrap">
              {(globalTotalDuration * 0.5 / 1000000).toFixed(1)}s
            </div>
            <div className="absolute left-3/4 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-foreground/60 whitespace-nowrap">
              {(globalTotalDuration * 0.75 / 1000000).toFixed(1)}s
            </div>
            <div className="absolute right-0 bottom-1 text-right text-[10px] font-semibold text-foreground/60 whitespace-nowrap">
              {(globalTotalDuration / 1000000).toFixed(1)}s
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1">
        {sortedRuns.map((run, index) => (
          <RunItem
            key={run.run_id}
            run={run}
            threadStartTime={globalStartTime}
            threadTotalDuration={globalTotalDuration}
            titleWidth={titleWidth}
            defaultExpanded={index === sortedRuns.length - 1}
          />
        ))}
      </div>
    </div>
  );
};
