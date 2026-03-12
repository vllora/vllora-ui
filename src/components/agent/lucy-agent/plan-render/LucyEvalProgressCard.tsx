/**
 * LucyEvalProgressCard
 *
 * Live progress card shown during active evaluation jobs.
 * Listens to `vllora_dry_run_job_update` events and shows
 * per-record progress, partial mean score, and elapsed time.
 *
 * Mockup Scenario #6: Active Watching
 */

import { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { emitter } from '@/utils/eventEmitter';
import type { EvalJob } from '@/types/eval-job';

// =============================================================================
// Types
// =============================================================================

interface EvalProgressCardProps {
  /** The dataset ID to filter events for */
  readonly datasetId: string;
  /** Initial job data (if already running when card mounts) */
  readonly initialJob?: EvalJob;
}

// =============================================================================
// Helpers
// =============================================================================

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/** Format score as raw decimal (mockup style: 0.45, not 45.0%). */
function formatScore(score: number): string {
  return score.toFixed(2);
}

// =============================================================================
// Component
// =============================================================================

export function LucyEvalProgressCard({ datasetId, initialJob }: EvalProgressCardProps) {
  const [completedRows, setCompletedRows] = useState(
    initialJob?.pollingSnapshot?.completed_rows ?? 0,
  );
  const [totalRows, setTotalRows] = useState(
    initialJob?.pollingSnapshot?.total_rows ?? 0,
  );
  const [avgScore, setAvgScore] = useState<number | undefined>(
    initialJob?.pollingSnapshot?.summary?.average_score ?? undefined,
  );
  const [isComplete, setIsComplete] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef(Date.now());
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Elapsed time ticker
  useEffect(() => {
    elapsedTimerRef.current = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 1000);

    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  // Listen for job update events
  useEffect(() => {
    const handleUpdate = ({ job }: { jobId: string; job: EvalJob }) => {
      if (job.datasetId !== datasetId) return;

      const snapshot = job.pollingSnapshot;
      if (snapshot) {
        setCompletedRows(snapshot.completed_rows + (snapshot.failed_rows ?? 0));
        setTotalRows(snapshot.total_rows);
        if (snapshot.summary?.average_score != null) {
          setAvgScore(snapshot.summary.average_score);
        }
      }

      if (job.status === 'completed' || job.status === 'failed') {
        setIsComplete(true);
        if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      }
    };

    emitter.on('vllora_dry_run_job_update', handleUpdate);
    return () => { emitter.off('vllora_dry_run_job_update', handleUpdate); };
  }, [datasetId]);

  const progress = totalRows > 0 ? (completedRows / totalRows) * 100 : 0;

  // Don't render after completion — the analysis card will take over
  if (isComplete) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[rgb(var(--theme-500))]" />
          <span className="text-xs font-semibold text-foreground">Evaluating</span>
        </div>
        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse">
          In Progress
        </span>
      </div>

      {/* Record progress */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">
            {completedRows} / {totalRows} records
          </span>
          <span className="text-muted-foreground tabular-nums">
            {progress.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-[rgb(var(--theme-500))] rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Partial results */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {avgScore != null && (
          <span>
            Mean: <span className="font-mono font-medium text-foreground">{formatScore(avgScore)}</span>
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatElapsed(elapsed)}
        </span>
      </div>

      {/* Continue in background hint */}
      <div className="pt-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground w-full"
          onClick={() => {
            emitter.emit('vllora_switch_tab', { datasetId, tab: 'overview' });
          }}
        >
          <ExternalLink className="w-3 h-3" />
          Continue in background
        </Button>
      </div>
    </div>
  );
}
