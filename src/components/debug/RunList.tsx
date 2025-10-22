import React from 'react';
import { DebugRun } from '@/hooks/events/useDebugTimeline';
import { RunItem } from './RunItem';
import { TimelineHeader } from './TimelineHeader';

interface RunListProps {
  runs: DebugRun[];
  selectedSpanId?: string;
  onSpanSelect?: (spanId: string) => void;
}

export const RunList: React.FC<RunListProps> = ({ runs, selectedSpanId, onSpanSelect }) => {
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
      <div className="sticky top-0 z-10 bg-background">
        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/50 bg-muted/20">
          Showing {runs.length} run{runs.length !== 1 ? 's' : ''}
        </div>

        {/* Timeline header with ticks */}
        <TimelineHeader titleWidth={titleWidth} totalDuration={globalTotalDuration} />
      </div>

      <div className="flex flex-col gap-2 p-2">
        {sortedRuns.map((run) => (
          <RunItem
            key={run.run_id}
            run={run}
            totalDuration={globalTotalDuration}
            startTime={globalStartTime}
            endTime={globalEndTime}
            titleWidth={titleWidth}
            selectedSpanId={selectedSpanId}
            onSpanSelect={onSpanSelect}
          />
        ))}
      </div>
    </div>
  );
};
