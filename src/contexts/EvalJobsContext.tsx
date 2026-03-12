/**
 * EvalJobsContext
 *
 * Provides reactive state for evaluation jobs to UI components.
 * Subscribes to SSE eval_job_update events from the BE state tracker.
 * When an SSE event arrives for a running job, fetches fresh metrics
 * from the cloud-proxy endpoint via evalPollingManager.
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
import type { CustomEvent, CustomEvalJobUpdateEventType } from '@/contexts/project-events/dto';
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

  // SSE subscription
  const { subscribe, isConnected } = ProjectEventsConsumer();
  const subscriptionIdRef = useRef<string>(`eval-jobs-${workflowId}-${Date.now()}`);
  const wasConnectedRef = useRef(false);

  // Load jobs from gateway SQLite
  const loadJobs = useCallback(async () => {
    try {
      const fetchedJobs = await evalJobService.getByDataset(workflowId);
      setJobs(fetchedJobs);
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
        evalPollingManager.startPolling(job.id);
      } else if (!isActive && pollingJobIdsRef.current.has(job.id)) {
        pollingJobIdsRef.current.delete(job.id);
        evalPollingManager.stopPolling(job.id);
      }

      // Catch-up: if job is terminal but has no results, fetch them now.
      // This handles the race where the BE state tracker set "completed"
      // before the FE polling manager fetched results from the cloud API.
      const isTerminal = job.status === 'completed' || job.status === 'failed';
      const hasResults = (job.pollingSnapshot?.completed_rows ?? 0) > 0;
      if (isTerminal && !hasResults && job.evaluationRunId && !refreshedJobIdsRef.current.has(job.id)) {
        refreshedJobIdsRef.current.add(job.id);
        evalPollingManager.refreshJob(job.id).then(() => loadJobs());
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

  // Subscribe to SSE eval_job_update events from BE state tracker
  useEffect(() => {
    const unsubscribe = subscribe(
      subscriptionIdRef.current,
      (event) => {
        if (event.type !== 'Custom') return;
        const customEvent = event as CustomEvent;
        if (customEvent.event.type !== 'eval_job_update') return;

        const sseEvent = customEvent.event as CustomEvalJobUpdateEventType;
        // Only handle events for this workflow
        if (sseEvent.workflow_id !== workflowId) return;

        // Trigger cloud-proxy fetch via the manager
        // (manager will emit 'vllora_eval_job_update' after fetching,
        //  which the local emitter listener above picks up)
        evalPollingManager.handleSseStatusChange(sseEvent.job_id, sseEvent.status);
      },
      (event) => event.type === 'Custom',
    );

    return () => { unsubscribe(); };
  }, [subscribe, workflowId]);

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

  const lastCompletedJob = useMemo(
    () => jobs.find((j) => j.status === 'completed' && j.result) || null,
    [jobs]
  );

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
