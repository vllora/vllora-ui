import React from 'react';
import { PlayCircle } from 'lucide-react';
import { DebugRun } from '@/hooks/events/useDebugTimeline';
import { TraceItem } from './TraceItem';

interface RunItemProps {
  run: DebugRun;
  totalDuration: number;
  startTime: number;
  endTime: number;
  titleWidth: number;
  selectedSpanId?: string;
  onSpanSelect?: (spanId: string) => void;
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

export const RunItem: React.FC<RunItemProps> = ({
  run,
  totalDuration,
  startTime,
  endTime,
  titleWidth,
  selectedSpanId,
  onSpanSelect,
}) => {
  const sortedTraces = [...run.traces].sort((a, b) => a.start_time_us - b.start_time_us);
  return (
    <div className="flex flex-col rounded">
      {/* Run Header */}
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              Run
            </span>
            <span className="text-xs font-mono text-muted-foreground">
              {run.run_id || 'unknown'}
            </span>
          </div>
         
        </div>
      </div>

      {/* Traces */}
      <div className="flex flex-col gap-2 px-4">
        {sortedTraces.map((trace) => (
          <TraceItem
            key={trace.trace_id}
            trace={trace}
            totalDuration={totalDuration}
            startTime={startTime}
            endTime={endTime}
            titleWidth={titleWidth}
            selectedSpanId={selectedSpanId}
            onSpanSelect={onSpanSelect}
          />
        ))}
      </div>
    </div>
  );
};
