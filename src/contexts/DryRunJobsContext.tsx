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
import type { DatasetRecord, Dataset } from '@/types/dataset-types';
import { getDryRunJobsByDataset } from '@/services/dry-run-jobs-db';
import { dryRunPollingManager } from '@/services/dry-run-polling-manager';
import { emitter } from '@/utils/eventEmitter';
import { uploadDatasetForFinetune } from '@/services/finetune-api';
import * as datasetsDB from '@/services/datasets-db';
import { toast } from 'sonner';

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
  records: DatasetRecord[];
}) {
  const { dataset, records } = props;

  const [jobs, setJobs] = useState<DryRunJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentBackendDatasetId, setCurrentBackendDatasetId] = useState<string | undefined>(
    dataset.backendDatasetId
  );

  const datasetId = dataset.id;
  const evalScript = dataset.evalScript;

  // Update backend dataset ID when dataset changes
  useEffect(() => {
    setCurrentBackendDatasetId(dataset.backendDatasetId);
  }, [dataset.backendDatasetId]);

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

  // Start a new dry run
  const startDryRun = useCallback(
    async (sampleSize: number, rolloutModel?: string): Promise<string> => {
      if (!evalScript) {
        throw new Error('Grader must be configured first');
      }

      // Auto-upload dataset if not already uploaded
      let backendDatasetId = currentBackendDatasetId;
      const needsUpload = !backendDatasetId;

      if (needsUpload) {
        toast.info('Uploading dataset to backend...');
        try {
          // Upload includes eval script, so no need to sync separately
          const uploadResult = await uploadDatasetForFinetune({
            ...dataset,
            records,
          });
          backendDatasetId = uploadResult.backendDatasetId;
          // Save the backend ID to the dataset
          await datasetsDB.updateDatasetBackendId(datasetId, backendDatasetId);
          setCurrentBackendDatasetId(backendDatasetId);
          toast.success('Dataset uploaded successfully');
        } catch (uploadError) {
          toast.error('Failed to upload dataset');
          throw uploadError;
        }
      }
      // Note: If dataset was already uploaded, we proceed with the eval script
      // that was included during upload. The cloud API doesn't support PATCH for
      // updating evaluators. To use a new eval script, user needs to re-upload.

      // Build record topics mapping using row_index (position in array)
      // The backend uses row_index to identify rows, which matches the upload order
      const recordTopics: Record<number, string> = {};
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (record.topic) {
          recordTopics[i] = record.topic;
        }
      }

      // backendDatasetId is guaranteed to be defined at this point
      // (either from upload or from existing value)
      return dryRunPollingManager.startDryRun({
        datasetId,
        backendDatasetId: backendDatasetId!,
        sampleSize,
        recordTopics: Object.keys(recordTopics).length > 0 ? recordTopics : undefined,
        rolloutModel,
      });
    },
    [datasetId, dataset, currentBackendDatasetId, evalScript, records]
  );

  // Cancel a dry run
  const cancelDryRun = useCallback(async (jobId: string): Promise<void> => {
    await dryRunPollingManager.cancelDryRun(jobId);
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
  };
}

// =============================================================================
// Provider
// =============================================================================

export function DryRunJobsProvider({
  children,
  dataset,
  records,
}: {
  children: ReactNode;
  dataset: Dataset;
  records: DatasetRecord[];
}) {
  const value = useDryRunJobs({ dataset, records });
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
