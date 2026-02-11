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
  ensureDatasetUploaded,
} from './finetune-api';
import { analyzeDryRunResults } from '@/lib/distri-dataset-tools/analysis/analyze-dry-run';
import * as datasetsDB from './datasets-db';
import { getWorkflowByDataset, updateStepData, markStepFailed } from './finetune-workflow-db';
import { toast } from 'sonner';

// =============================================================================
// Constants
// =============================================================================

const POLL_INTERVAL_MS = 6000; // 3 seconds
const MAX_POLL_ATTEMPTS = 120; // ~12 minutes max (120 * 6 seconds)
const MAX_CONSECUTIVE_ERRORS = 5;

// =============================================================================
// Singleton Class
// =============================================================================

class DryRunPollingManager {
  private static instance: DryRunPollingManager;
  private pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private pollAttempts: Map<string, number> = new Map();
  private consecutiveErrors: Map<string, number> = new Map();
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
   * Start a dry run for a dataset (high-level API)
   * Handles fetching dataset, auto-upload, and starting the dry run.
   * Used by both UI (DryRunJobsContext) and tool handlers.
   */
  async startDryRunForDataset(params: {
    datasetId: string;
    sampleSize: number;
    rolloutModel?: string;
  }): Promise<string> {
    const { datasetId, sampleSize, rolloutModel = 'gpt-4o-mini' } = params;

    // Validate dataset has eval script
    const dataset = await datasetsDB.getDatasetById(datasetId);
    if (!dataset) {
      throw new Error('Dataset not found');
    }

    if (!dataset.evalScript) {
      throw new Error('Grader must be configured first');
    }

    // Ensure dataset is uploaded (auto-uploads if needed)
    const backendDatasetId = await ensureDatasetUploaded(datasetId);

    // Start the dry run
    return this.startDryRun({
      datasetId,
      backendDatasetId,
      sampleSize,
      rolloutModel,
    });
  }

  /**
   * Start a new dry run job (low-level API)
   * Requires backendDatasetId to already exist.
   */
  async startDryRun(params: StartDryRunParams): Promise<string> {
    const {
      datasetId,
      backendDatasetId,
      sampleSize,
      rolloutModel = 'gpt-4o-mini',
    } = params;

    // Create job record in pending state
    const job = await createDryRunJob({
      datasetId,
      backendDatasetId,
      evaluationRunId: '',
      status: 'pending',
      sampleSize,
      createdAt: Date.now(),
    });

    try {
      // Call backend to create evaluation
      const evaluationResponse = await createEvaluation({
        dataset_id: backendDatasetId,
        rollout_model_params: {
          model: rolloutModel,
        },
        offset: 0,
        limit: sampleSize,
      });

      // Update job with evaluation run ID and start polling
      await updateDryRunJob(job.id, {
        evaluationRunId: evaluationResponse.evaluation_run_id,
        status: 'running',
        startedAt: Date.now(),
      });

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
    this.consecutiveErrors.delete(jobId);
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
      await this.markWorkflowStepFailed(job.datasetId);
      toast.error('Dry run timed out');
      return;
    }

    try {
      const result = await getEvaluationResult(job.evaluationRunId);

      // Reset consecutive errors on success
      this.consecutiveErrors.set(jobId, 0);

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

      // Track consecutive errors
      const errorCount = (this.consecutiveErrors.get(jobId) || 0) + 1;
      this.consecutiveErrors.set(jobId, errorCount);

      if (errorCount >= MAX_CONSECUTIVE_ERRORS) {
        this.stopPolling(jobId);
        await updateDryRunJob(jobId, {
          status: 'failed',
          error: 'Dry run failed: unable to reach evaluation server after multiple attempts',
          completedAt: Date.now(),
        });
        await this.markWorkflowStepFailed(job.datasetId);
        toast.error('Dry run failed: unable to reach evaluation server');
      }
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
        await this.markWorkflowStepFailed(job.datasetId);
        toast.error('Dry run failed');
        return;
      }

      // Build record topics mapping from database
      // This works even after page refresh since we fetch from DB
      const records = await datasetsDB.getRecordsByDatasetId(job.datasetId);
      const recordTopics: Record<number, string> = {};
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (record.topic) {
          recordTopics[i] = record.topic;
        }
      }

      // Analyze results
      const samplePercentage = Math.round((job.sampleSize / result.total_rows) * 100);
      const dryRunStats = analyzeDryRunResults(
        result,
        samplePercentage,
        Object.keys(recordTopics).length > 0 ? recordTopics : undefined
      );

      // Persist per-row scores to individual records
      if (result.results && result.results.length > 0) {
        for (const row of result.results) {
          if (typeof row.score === 'number' && row.dataset_row_id) {
            await datasetsDB.updateRecordEvaluation(
              job.datasetId,
              row.dataset_row_id,
              row.score
            );
          }
        }
      }

      // Save results to dataset
      await datasetsDB.updateDatasetDryRunStats(job.datasetId, dryRunStats);

      // Update job with results
      await updateDryRunJob(jobId, {
        status: 'completed',
        completedAt: Date.now(),
        result: dryRunStats,
      });

      // Update workflow step data on success
      try {
        const workflow = await getWorkflowByDataset(job.datasetId);
        if (workflow && workflow.currentStep === 'dry_run') {
          const allSamples = [
            ...(dryRunStats.sampleResults.highest || []),
            ...(dryRunStats.sampleResults.lowest || []),
            ...(dryRunStats.sampleResults.aroundMean || []),
          ];
          await updateStepData(workflow.id, 'dryRun', {
            mean: dryRunStats.statistics.mean,
            std: dryRunStats.statistics.std,
            percentAboveZero: dryRunStats.statistics.percentAboveZero,
            percentPerfect: dryRunStats.statistics.percentPerfect,
            verdict: dryRunStats.diagnosis.verdict,
            sampleResults: allSamples.map((s) => ({
              recordId: s.recordId,
              prompt: '',
              response: '',
              score: s.score,
              reasoning: s.reason || '',
            })),
            recommendations: dryRunStats.diagnosis.recommendations || [],
          });
        }
      } catch (wfError) {
        console.error('[DryRunPollingManager] Failed to update workflow:', wfError);
      }

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
      await this.markWorkflowStepFailed(job.datasetId);
      toast.error('Failed to process dry run results');
    }
  }

  private async markWorkflowStepFailed(datasetId: string): Promise<void> {
    try {
      const workflow = await getWorkflowByDataset(datasetId);
      if (workflow && workflow.currentStep === 'dry_run') {
        await markStepFailed(workflow.id);
      }
    } catch (error) {
      console.error('[DryRunPollingManager] Failed to mark workflow step failed:', error);
    }
  }
}

// =============================================================================
// Export Singleton Instance
// =============================================================================

export const dryRunPollingManager = DryRunPollingManager.getInstance();
