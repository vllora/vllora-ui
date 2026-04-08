/**
 * EvalJobsContext
 *
 * Provides reactive state for evaluation jobs to UI components.
 * FE polls cloud every 10s for progress (in-memory only, BE tracks status independently).
 * SSE removed — polling handles all status detection.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { EvalJob } from '@/types/eval-job';
import type { Dataset } from '@/types/dataset-types';
import { evalJobService } from '@/services/service-registry';
import { evalPollingManager } from '@/services/eval-polling-manager';
import { ProjectEventsConsumer } from '@/contexts/project-events';
import { emitter } from '@/utils/eventEmitter';

// =============================================================================
// Types
// =============================================================================

export type EvalJobsContextType = ReturnType<typeof useEvalJobs>;

export const EvalJobsContext = createContext<EvalJobsContextType | null>(null);

// =============================================================================
// Hook (contains all logic)
// =============================================================================

function useEvalJobs(props: {
  dataset: Dataset;
}) {
  const { dataset } = props;

  const [jobs, setJobs] = useState<EvalJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const workflowId = dataset.id;

  // Preserve per-record results (pollingSnapshot) across loadJobs re-fetches.
  // pollingSnapshot is in-memory only — the API never returns it.
  const snapshotsRef = useRef<Map<string, EvalJob['pollingSnapshot']>>(new Map());

  // SSE reconnect detection (re-fetch jobs after gateway restart)
  const { isConnected } = ProjectEventsConsumer();
  const wasConnectedRef = useRef(isConnected);

  // Load jobs from gateway SQLite, merging back any cached pollingSnapshots
  const loadJobs = useCallback(async () => {
    try {
      const fetchedJobs = await evalJobService.getByDataset(workflowId);
      const merged = fetchedJobs.map((job) => {
        const cached = snapshotsRef.current.get(job.id);
        if (cached && !job.pollingSnapshot) {
          return { ...job, pollingSnapshot: cached };
        }
        return job;
      });
      setJobs(merged);
    } catch (error) {
      console.error('[EvalJobsContext] Failed to load jobs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [workflowId]);

  // Initialize manager and load jobs on mount
  useEffect(() => {
    evalPollingManager.initialize();
    loadJobs();
  }, [loadJobs]);

  // Track which jobs we've started polling for (prevents restart loop)
  const pollingJobIdsRef = useRef<Set<string>>(new Set());

  // Track which completed jobs we've already refreshed (catch-up for race condition)
  const refreshedJobIdsRef = useRef<Set<string>>(new Set());

  // Start/stop polling based on job status (view-scoped via provider lifecycle)
  useEffect(() => {
    for (const job of jobs) {
      const isActive = job.status === 'running';
      if (isActive && job.evaluationRunId && !pollingJobIdsRef.current.has(job.id)) {
        pollingJobIdsRef.current.add(job.id);
        evalPollingManager.startPolling(job);
      } else if (!isActive && pollingJobIdsRef.current.has(job.id)) {
        pollingJobIdsRef.current.delete(job.id);
        evalPollingManager.stopPolling(job.id);
      }

      // Catch-up: fetch per-record results from cloud for completed jobs.
      // pollingSnapshot is in-memory only, so after page reload it's gone.
      // Single attempt here; the eval detail view auto-retries when opened.
      const isTerminal = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled';
      const needsSnapshot = isTerminal && !job.pollingSnapshot && job.evaluationRunId;
      if (needsSnapshot && !refreshedJobIdsRef.current.has(job.id)) {
        refreshedJobIdsRef.current.add(job.id);
        evalPollingManager.refreshJob(job.id).catch(() => {
          // Allow retry when user opens eval detail view
          refreshedJobIdsRef.current.delete(job.id);
        });
      }
    }
  }, [jobs, loadJobs]);

  // Cleanup: stop all polling when provider unmounts (user navigates away)
  useEffect(() => {
    return () => {
      for (const jobId of pollingJobIdsRef.current) {
        evalPollingManager.stopPolling(jobId);
      }
      pollingJobIdsRef.current.clear();
    };
  }, []);

  // Listen for local emitter events (from evalPollingManager after job creation/updates)
  useEffect(() => {
    const handleJobUpdate = (event: { jobId: string; job: EvalJob }) => {
      if (event.job.workflowId !== workflowId) return;

      // Cache pollingSnapshot so it survives loadJobs re-fetches
      if (event.job.pollingSnapshot) {
        snapshotsRef.current.set(event.jobId, event.job.pollingSnapshot);
      }

      setJobs((prevJobs) => {
        const existingIndex = prevJobs.findIndex((j) => j.id === event.jobId);
        if (existingIndex >= 0) {
          const newJobs = [...prevJobs];
          newJobs[existingIndex] = event.job;
          return newJobs;
        }
        return [event.job, ...prevJobs];
      });
    };

    emitter.on('vllora_eval_job_update', handleJobUpdate);
    return () => { emitter.off('vllora_eval_job_update', handleJobUpdate); };
  }, [workflowId]);

  // Re-fetch jobs on SSE reconnect (covers BE restart gap)
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      // Just reconnected — refresh to catch any updates missed during downtime
      loadJobs();
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected, loadJobs]);

  // Start a new evaluation
  const startDryRun = useCallback(
    async (sampleSize: number, rolloutModel?: string): Promise<string> => {
      return evalPollingManager.createAndStartEval({
        workflowId,
        sampleSize,
        rolloutModel,
      });
    },
    [workflowId]
  );

  // Cancel an evaluation
  const cancelDryRun = useCallback(async (jobId: string): Promise<void> => {
    await evalPollingManager.cancelEval(jobId);
  }, []);

  // Refresh a single job's data from the cloud-proxy
  const refreshJob = useCallback(async (jobId: string): Promise<void> => {
    await evalPollingManager.refreshJob(jobId);
  }, []);

  // Computed state
  const runningJob = useMemo(
    () => jobs.find((j) => j.status === 'running' || j.status === 'pending') || null,
    [jobs]
  );

  // The analyzed eval blob (distribution, topic breakdown, readiness gate,
  // sample results) is persisted on the dataset row via datasetService.updateEvalStats,
  // NOT on the eval_jobs row — the gateway's EvalJobStateTracker only mirrors
  // status + per-record scores from cloud. So find the latest terminal job and
  // attach dataset.evalStats as its `result`.
  const lastCompletedJob = useMemo(() => {
    const terminal = jobs.find(
      (j) => j.status === 'completed' || j.status === 'cancelled',
    );
    if (!terminal) return null;
    if (terminal.result) return terminal;
    if (dataset.evalStats) return { ...terminal, result: dataset.evalStats };
    return null;
  }, [jobs, dataset.evalStats]);

  return {
    workflowId,
    jobs,
    isLoading,
    runningJob,
    lastCompletedJob,
    startDryRun,
    cancelDryRun,
    refreshJobs: loadJobs,
    refreshJob,
  };
}

// =============================================================================
// Provider
// =============================================================================

export function EvalJobsProvider({
  children,
  dataset,
}: {
  children: ReactNode;
  dataset: Dataset;
}) {
  const value = useEvalJobs({ dataset });
  return <EvalJobsContext.Provider value={value}>{children}</EvalJobsContext.Provider>;
}

// =============================================================================
// Consumer
// =============================================================================

export function EvalJobsConsumer() {
  const value = useContext(EvalJobsContext);
  if (value === null) {
    throw new Error('EvalJobsContext must be used within an EvalJobsProvider');
  }
  return value;
}
