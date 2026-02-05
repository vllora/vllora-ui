/**
 * Dry Run Polling Manager
 *
 * Singleton service that manages background polling for dry run jobs.
 * Survives component unmounts and can recover from page refresh.
 */

import type { StartDryRunParams } from '@/types/dry-run-job';
import {
  createDryRunJob,
  getDryRunJob,
  getRunningDryRunJobs,
  getPendingDryRunJobs,
  updateDryRunJob,
} from './dry-run-jobs-db';
import {
  createEvaluation,
  getEvaluationResult,
} from './finetune-api';
import { analyzeDryRunResults } from '@/lib/distri-dataset-tools/analysis/analyze-dry-run';
import * as datasetsDB from './datasets-db';
import { toast } from 'sonner';

// =============================================================================
// Constants
// =============================================================================

const POLL_INTERVAL_MS = 3000; // 3 seconds
const MAX_POLL_ATTEMPTS = 120; // 6 minutes max (120 * 3 seconds)

// =============================================================================
// Singleton Class
// =============================================================================

class DryRunPollingManager {
  private static instance: DryRunPollingManager;
  private pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private pollAttempts: Map<string, number> = new Map();
  private initialized = false;

  private constructor() {}

  static getInstance(): DryRunPollingManager {
    if (!DryRunPollingManager.instance) {
      DryRunPollingManager.instance = new DryRunPollingManager();
    }
    return DryRunPollingManager.instance;
  }

  /**
   * Initialize the polling manager
   * Call this on app startup to resume polling for any running jobs
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      // Get all running and pending jobs
      const [runningJobs, pendingJobs] = await Promise.all([
        getRunningDryRunJobs(),
        getPendingDryRunJobs(),
      ]);

      // Resume polling for running jobs
      for (const job of runningJobs) {
        await this.resumePolling(job.id);
      }

      // Check pending jobs - they may have been interrupted before evaluation started
      for (const job of pendingJobs) {
        // Mark as failed if pending for too long (more than 1 minute)
        if (Date.now() - job.createdAt > 60000) {
          await updateDryRunJob(job.id, {
            status: 'failed',
            error: 'Job was interrupted before evaluation started',
            completedAt: Date.now(),
          });
        }
      }
    } catch (error) {
      console.error('[DryRunPollingManager] Failed to initialize:', error);
    }
  }

  /**
   * Start a new dry run job
   */
  async startDryRun(params: StartDryRunParams): Promise<string> {
    const {
      datasetId,
      backendDatasetId,
      sampleSize,
      recordTopics,
    } = params;

    // Create job record in pending state
    const job = await createDryRunJob({
      datasetId,
      backendDatasetId,
      evaluationRunId: '', // Will be filled after API call
      status: 'pending',
      sampleSize,
      createdAt: Date.now(),
    });

    try {
      // Call backend to create evaluation
      const evaluationResponse = await createEvaluation({
        dataset_id: backendDatasetId,
        rollout_model_params: {},
        offset: 0,
        limit: sampleSize,
      });

      // Update job with evaluation run ID and start polling
      await updateDryRunJob(job.id, {
        evaluationRunId: evaluationResponse.evaluation_run_id,
        status: 'running',
        startedAt: Date.now(),
      });

      // Store record topics for later analysis
      if (recordTopics) {
        // Store in memory for this job
        this.storeRecordTopics(job.id, recordTopics);
      }

      // Start polling
      this.startPolling(job.id);

      toast.info('Dry run started in background', { duration: 3000 });

      return job.id;
    } catch (error) {
      // Mark job as failed
      await updateDryRunJob(job.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to start evaluation',
        completedAt: Date.now(),
      });

      toast.error('Failed to start dry run');
      throw error;
    }
  }

  /**
   * Resume polling for a job (e.g., after page refresh)
   */
  async resumePolling(jobId: string): Promise<void> {
    const job = await getDryRunJob(jobId);
    if (!job) return;

    // Check current status from backend
    try {
      const result = await getEvaluationResult(job.evaluationRunId);

      if (result.status === 'completed' || result.status === 'failed') {
        // Job already finished, process results
        await this.handleJobComplete(jobId, result);
      } else {
        // Still running, resume polling
        this.startPolling(jobId);
      }
    } catch (error) {
      console.error(`[DryRunPollingManager] Failed to resume polling for ${jobId}:`, error);
      await updateDryRunJob(jobId, {
        status: 'failed',
        error: 'Failed to recover job state',
        completedAt: Date.now(),
      });
    }
  }

  /**
   * Stop polling for a job
   */
  stopPolling(jobId: string): void {
    const interval = this.pollingIntervals.get(jobId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(jobId);
    }
    this.pollAttempts.delete(jobId);
    this.clearRecordTopics(jobId);
  }

  /**
   * Cancel a running dry run
   */
  async cancelDryRun(jobId: string): Promise<void> {
    this.stopPolling(jobId);

    await updateDryRunJob(jobId, {
      status: 'cancelled',
      completedAt: Date.now(),
    });

    toast.info('Dry run cancelled');
  }

  /**
   * Check if a job is currently being polled
   */
  isPolling(jobId: string): boolean {
    return this.pollingIntervals.has(jobId);
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private startPolling(jobId: string): void {
    // Don't start if already polling
    if (this.pollingIntervals.has(jobId)) return;

    this.pollAttempts.set(jobId, 0);

    const interval = setInterval(async () => {
      await this.pollJob(jobId);
    }, POLL_INTERVAL_MS);

    this.pollingIntervals.set(jobId, interval);

    // Do an immediate poll
    this.pollJob(jobId);
  }

  private async pollJob(jobId: string): Promise<void> {
    const job = await getDryRunJob(jobId);
    if (!job || job.status !== 'running') {
      this.stopPolling(jobId);
      return;
    }

    // Increment poll attempts
    const attempts = (this.pollAttempts.get(jobId) || 0) + 1;
    this.pollAttempts.set(jobId, attempts);

    // Check for timeout
    if (attempts > MAX_POLL_ATTEMPTS) {
      this.stopPolling(jobId);
      await updateDryRunJob(jobId, {
        status: 'failed',
        error: 'Dry run timed out',
        completedAt: Date.now(),
      });
      toast.error('Dry run timed out');
      return;
    }

    try {
      const result = await getEvaluationResult(job.evaluationRunId);

      // Update progress with polling snapshot (full result for investigation)
      await updateDryRunJob(jobId, {
        pollingSnapshot: result,
      });

      // Check if complete
      if (result.status === 'completed' || result.status === 'failed') {
        await this.handleJobComplete(jobId, result);
      }
    } catch (error) {
      console.error(`[DryRunPollingManager] Poll failed for ${jobId}:`, error);
      // Don't fail immediately on a single poll error, let it retry
    }
  }

  private async handleJobComplete(
    jobId: string,
    result: Awaited<ReturnType<typeof getEvaluationResult>>
  ): Promise<void> {
    this.stopPolling(jobId);

    const job = await getDryRunJob(jobId);
    if (!job) return;

    try {
      if (result.status === 'failed') {
        await updateDryRunJob(jobId, {
          status: 'failed',
          error: 'Evaluation failed on backend',
          completedAt: Date.now(),
        });
        toast.error('Dry run failed');
        return;
      }

      // Get record topics if stored
      const recordTopics = this.getRecordTopics(jobId);
      // Analyze results
      const samplePercentage = Math.round((job.sampleSize / result.total_rows) * 100);
      const dryRunStats = analyzeDryRunResults(
        result,
        samplePercentage,
        recordTopics
      );

      // Save results to dataset
      await datasetsDB.updateDatasetDryRunStats(job.datasetId, dryRunStats);

      // Update job with results
      await updateDryRunJob(jobId, {
        status: 'completed',
        completedAt: Date.now(),
        result: dryRunStats,
      });

      // Show verdict toast
      const verdict = dryRunStats.diagnosis.verdict;
      if (verdict === 'GO') {
        toast.success('Dry run complete: GO - Ready for training', { duration: 5000 });
      } else if (verdict === 'WARNING') {
        toast.warning('Dry run complete: WARNING - Review recommendations', { duration: 5000 });
      } else {
        toast.error('Dry run complete: NO-GO - Issues detected', { duration: 5000 });
      }
    } catch (error) {
      console.error('[DryRunPollingManager] Failed to process results:', error);
      await updateDryRunJob(jobId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to process results',
        completedAt: Date.now(),
      });
      toast.error('Failed to process dry run results');
    }
  }

  // =============================================================================
  // Record Topics Storage (in-memory for current session)
  // =============================================================================

  private recordTopicsMap: Map<string, Record<string, string>> = new Map();

  private storeRecordTopics(jobId: string, topics: Record<string, string>): void {
    this.recordTopicsMap.set(jobId, topics);
  }

  private getRecordTopics(jobId: string): Record<string, string> | undefined {
    return this.recordTopicsMap.get(jobId);
  }

  private clearRecordTopics(jobId: string): void {
    this.recordTopicsMap.delete(jobId);
  }
}

// =============================================================================
// Export Singleton Instance
// =============================================================================

export const dryRunPollingManager = DryRunPollingManager.getInstance();
