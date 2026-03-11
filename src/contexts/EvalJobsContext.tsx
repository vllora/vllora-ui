/**
 * EvalJobsContext
 *
 * Provides reactive state for evaluation jobs to UI components.
 * Bridges between the singleton polling manager and React.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { EvalJob } from '@/types/eval-job';
import type { Dataset } from '@/types/dataset-types';
import { evalJobService } from '@/services/service-registry';
import { evalPollingManager } from '@/services/eval-polling-manager';
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
  const datasetId = dataset.id;

  // Load jobs from IndexedDB
  const loadJobs = useCallback(async () => {
    try {
      const fetchedJobs = await evalJobService.getByDataset(datasetId);
      setJobs(fetchedJobs);

    } catch (error) {
      console.error('[EvalJobsContext] Failed to load jobs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [datasetId]);

  // Initialize polling manager and load jobs on mount
  useEffect(() => {
    evalPollingManager.initialize();
    loadJobs();
  }, [loadJobs]);

  // Listen for job update events
  useEffect(() => {
    const handleJobUpdate = (event: { jobId: string; job: EvalJob }) => {
      // Only update if this job belongs to current dataset
      if (event.job.datasetId === datasetId) {
        setJobs((prevJobs) => {
          const existingIndex = prevJobs.findIndex((j) => j.id === event.jobId);
          if (existingIndex >= 0) {
            // Update existing job
            const newJobs = [...prevJobs];
            newJobs[existingIndex] = event.job;
            return newJobs;
          } else {
            // Add new job at the beginning
            return [event.job, ...prevJobs];
          }
        });
      }
    };

    emitter.on('vllora_dry_run_job_update', handleJobUpdate);

    return () => {
      emitter.off('vllora_dry_run_job_update', handleJobUpdate);
    };
  }, [datasetId]);

  // Start a new evaluation (delegates to polling manager which handles auto-upload and validation)
  const startDryRun = useCallback(
    async (sampleSize: number, rolloutModel?: string): Promise<string> => {
      return evalPollingManager.startEvalForDataset({
        datasetId,
        sampleSize,
        rolloutModel,
      });
    },
    [datasetId]
  );

  // Cancel an evaluation
  const cancelDryRun = useCallback(async (jobId: string): Promise<void> => {
    await evalPollingManager.cancelEval(jobId);
  }, []);

  // Refresh a single job's data from the backend API
  const refreshJob = useCallback(async (jobId: string): Promise<void> => {
    await evalPollingManager.refreshJob(jobId);
  }, []);

  // Compute derived state
  const runningJob = useMemo(
    () => jobs.find((j) => j.status === 'running' || j.status === 'pending') || null,
    [jobs]
  );

  // Find most recent completed job with results
  const lastCompletedJob = useMemo(
    () => jobs.find((j) => j.status === 'completed' && j.result) || null,
    [jobs]
  );

  return {
    datasetId,
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
