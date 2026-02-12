/**
 * DryRunJobsContext
 *
 * Provides reactive state for dry run jobs to UI components.
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
import type { DryRunJob } from '@/types/dry-run-job';
import type { Dataset } from '@/types/dataset-types';
import { getDryRunJobsByDataset } from '@/services/dry-run-jobs-db';
import { dryRunPollingManager } from '@/services/dry-run-polling-manager';
import { emitter } from '@/utils/eventEmitter';

// =============================================================================
// Types
// =============================================================================

export type DryRunJobsContextType = ReturnType<typeof useDryRunJobs>;

export const DryRunJobsContext = createContext<DryRunJobsContextType | null>(null);

// =============================================================================
// Hook (contains all logic)
// =============================================================================

function useDryRunJobs(props: {
  dataset: Dataset;
}) {
  const { dataset } = props;

  const [jobs, setJobs] = useState<DryRunJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const datasetId = dataset.id;

  // Load jobs from IndexedDB
  const loadJobs = useCallback(async () => {
    try {
      const fetchedJobs = await getDryRunJobsByDataset(datasetId);
      setJobs(fetchedJobs);
    } catch (error) {
      console.error('[DryRunJobsContext] Failed to load jobs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [datasetId]);

  // Initialize polling manager and load jobs on mount
  useEffect(() => {
    dryRunPollingManager.initialize();
    loadJobs();
  }, [loadJobs]);

  // Listen for job update events
  useEffect(() => {
    const handleJobUpdate = (event: { jobId: string; job: DryRunJob }) => {
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

  // Start a new dry run (delegates to polling manager which handles auto-upload and validation)
  const startDryRun = useCallback(
    async (sampleSize: number, rolloutModel?: string): Promise<string> => {
      return dryRunPollingManager.startDryRunForDataset({
        datasetId,
        sampleSize,
        rolloutModel,
      });
    },
    [datasetId]
  );

  // Cancel a dry run
  const cancelDryRun = useCallback(async (jobId: string): Promise<void> => {
    await dryRunPollingManager.cancelDryRun(jobId);
  }, []);

  // Refresh a single job's data from the backend API
  const refreshJob = useCallback(async (jobId: string): Promise<void> => {
    await dryRunPollingManager.refreshJob(jobId);
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

export function DryRunJobsProvider({
  children,
  dataset,
}: {
  children: ReactNode;
  dataset: Dataset;
}) {
  const value = useDryRunJobs({ dataset });
  return <DryRunJobsContext.Provider value={value}>{children}</DryRunJobsContext.Provider>;
}

// =============================================================================
// Consumer
// =============================================================================

export function DryRunJobsConsumer() {
  const value = useContext(DryRunJobsContext);
  if (value === null) {
    throw new Error('DryRunJobsContext must be used within a DryRunJobsProvider');
  }
  return value;
}
