import React from 'react';
import { DebugRun } from '@/hooks/events/useDebugTimeline';
import { RunItem } from './RunItem';
import { TimelineHeader } from './TimelineHeader';

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
      <TimelineHeader titleWidth={titleWidth} totalDuration={globalTotalDuration} />

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
