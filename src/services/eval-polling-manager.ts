/**
 * Dry Run Polling Manager
 *
 * Singleton service that manages background polling for dry run jobs.
 * Survives component unmounts and can recover from page refresh.
 */

import type { StartEvalParams } from '@/types/eval-job';
import { evalJobService } from './service-registry';
import {
  createEvaluation,
  getEvaluationResult,
  ensureDatasetUploaded,
  flattenEvaluationResults,
} from './finetune-api';
import { analyzeEvalResults } from '@/lib/distri-dataset-tools/analysis/analyze-evaluation';
import { datasetService, recordService, workflowService } from './service-registry';
import { toast } from 'sonner';
import { emitter } from '@/utils/eventEmitter';

// =============================================================================
// Error helpers
// =============================================================================

/** Turn a raw API error into a short, user-friendly message. */
function friendlyEvalError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  // Common patterns → friendly messages
  if (/not\s*found/i.test(raw) && /dataset/i.test(raw)) {
    return 'Dataset not found on the evaluation server. Try re-uploading.';
  }
  if (/not\s*found/i.test(raw) && /evaluation/i.test(raw)) {
    return 'Evaluation run not found. It may have expired — try running again.';
  }
  if (/timeout|timed?\s*out/i.test(raw)) {
    return 'Evaluation server timed out. Try again with a smaller sample size.';
  }
  if (/unauthorized|forbidden|401|403/i.test(raw)) {
    return 'Authentication error. Check your API key in settings.';
  }
  if (/network|fetch|econnrefused/i.test(raw)) {
    return 'Cannot reach evaluation server. Is the backend running?';
  }
  if (/grader|eval\s*script/i.test(raw)) {
    return 'Grader script error. Check your script and try again.';
  }

  // Strip noisy prefixes like "API error 400 Bad Request: {...}"
  const jsonMatch = raw.match(/\{.*"error"\s*:\s*"([^"]+)"/);
  if (jsonMatch) return jsonMatch[1];

  // Fallback: truncate if too long
  if (raw.length > 120) return raw.slice(0, 117) + '…';
  return raw;
}

// =============================================================================
// Constants
// =============================================================================

const POLL_INTERVAL_MS = 6000; // 3 seconds
const MAX_POLL_ATTEMPTS = 9200; // ~92 minutes max (9200 * 6 seconds)
const MAX_CONSECUTIVE_ERRORS = 150;

// =============================================================================
// Singleton Class
// =============================================================================

class EvalPollingManager {
  private static instance: EvalPollingManager;
  private pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private pollAttempts: Map<string, number> = new Map();
  private consecutiveErrors: Map<string, number> = new Map();
  private initialized = false;

  private constructor() {}

  static getInstance(): EvalPollingManager {
    if (!EvalPollingManager.instance) {
      EvalPollingManager.instance = new EvalPollingManager();
    }
    return EvalPollingManager.instance;
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
        evalJobService.getRunning(),
        evalJobService.getPending(),
      ]);

      // Resume polling for running jobs
      for (const job of runningJobs) {
        await this.resumePolling(job.id);
      }

      // Check pending jobs - they may have been interrupted before evaluation started
      for (const job of pendingJobs) {
        // Mark as failed if pending for too long (more than 1 minute)
        if (Date.now() - job.createdAt > 60000) {
          await evalJobService.update(job.id, {
            status: 'failed',
            error: 'Job was interrupted before evaluation started',
            completedAt: Date.now(),
          });
        }
      }
    } catch (error) {
      console.error('[EvalPollingManager] Failed to initialize:', error);
    }
  }

  /**
   * Start a dry run for a dataset (high-level API)
   * Handles fetching dataset, auto-upload, and starting the dry run.
   * Used by both UI (EvalJobsContext) and tool handlers.
   */
  async startEvalForDataset(params: {
    datasetId: string;
    sampleSize: number;
    rolloutModel?: string;
  }): Promise<string> {
    const { datasetId, sampleSize, rolloutModel = 'gpt-4o-mini' } = params;

    // Validate dataset has eval script
    const dataset = await datasetService.getById(datasetId);
    if (!dataset) {
      throw new Error('Dataset not found');
    }

    if (!dataset.evalScript) {
      throw new Error('Grader must be configured first');
    }

    // Ensure dataset is uploaded (auto-uploads if needed)
    await ensureDatasetUploaded(datasetId);

    // Start the dry run
    return this.startEval({
      datasetId,
      sampleSize,
      rolloutModel,
    });
  }

  /**
   * Start a new dry run job (low-level API)
   * Dataset must already be uploaded.
   */
  async startEval(params: StartEvalParams): Promise<string> {
    const {
      datasetId,
      sampleSize,
      rolloutModel = 'gpt-4o-mini',
    } = params;

    // Create job record in pending state
    const job = await evalJobService.create({
      datasetId,
      evaluationRunId: '',
      status: 'pending',
      sampleSize,
      rolloutModel,
      createdAt: Date.now(),
    });

    try {
      // Call backend to create evaluation
      const evaluationResponse = await createEvaluation({
        dataset_id: datasetId,
        rollout_model_params: {
          model: rolloutModel,
        },
        offset: 0,
        limit: sampleSize,
      });

      // Update job with evaluation run ID and start polling
      await evalJobService.update(job.id, {
        evaluationRunId: evaluationResponse.evaluation_run_id,
        status: 'running',
        startedAt: Date.now(),
      });

      // Start polling
      this.startPolling(job.id);

      toast.info('Evaluation started in background', { duration: 3000 });

      return job.id;
    } catch (error) {
      const friendly = friendlyEvalError(error);
      // Mark job as failed
      await evalJobService.update(job.id, {
        status: 'failed',
        error: friendly,
        completedAt: Date.now(),
      });

      toast.error('Failed to start evaluation', { description: friendly });
      throw error;
    }
  }

  /**
   * Resume polling for a job (e.g., after page refresh)
   */
  async resumePolling(jobId: string): Promise<void> {
    const job = await evalJobService.get(jobId);
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
      console.error(`[EvalPollingManager] Failed to resume polling for ${jobId}:`, error);
      await evalJobService.update(jobId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to recover job state',
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
  async cancelEval(jobId: string): Promise<void> {
    this.stopPolling(jobId);

    await evalJobService.update(jobId, {
      status: 'cancelled',
      completedAt: Date.now(),
    });

    toast.info('Evaluation cancelled');
  }

  /**
   * Refresh a job's data from the backend API.
   * Re-fetches evaluation results and updates IndexedDB + emits event.
   */
  async refreshJob(jobId: string): Promise<void> {
    const job = await evalJobService.get(jobId);
    if (!job || !job.evaluationRunId) return;

    const result = await getEvaluationResult(job.evaluationRunId);

    // Update the polling snapshot so the UI gets fresh per-row data
    await evalJobService.update(jobId, {
      pollingSnapshot: result,
    });

    // If the backend shows completed/failed but the local job status disagrees,
    // re-process the results (e.g. a previously "failed" job that actually succeeded)
    if (
      (result.status === 'completed' || result.status === 'failed') &&
      job.status !== result.status
    ) {
      await this.handleJobComplete(jobId, result);
    }
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
    const job = await evalJobService.get(jobId);
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
      await evalJobService.update(jobId, {
        status: 'failed',
        error: 'Evaluation timed out',
        completedAt: Date.now(),
      });
      await this.markWorkflowStepFailed(job.datasetId);
      toast.error('Evaluation timed out');
      return;
    }

    try {
      const result = await getEvaluationResult(job.evaluationRunId);

      // Reset consecutive errors on success
      this.consecutiveErrors.set(jobId, 0);

      // Update progress with polling snapshot (full result for investigation)
      await evalJobService.update(jobId, {
        pollingSnapshot: result,
      });

      // Check if complete
      if (result.status === 'completed' || result.status === 'failed') {
        await this.handleJobComplete(jobId, result);
      }
    } catch (error) {
      console.error(`[EvalPollingManager] Poll failed for ${jobId}:`, error);

      // Track consecutive errors
      const errorCount = (this.consecutiveErrors.get(jobId) || 0) + 1;
      this.consecutiveErrors.set(jobId, errorCount);

      if (errorCount >= MAX_CONSECUTIVE_ERRORS) {
        this.stopPolling(jobId);
        await evalJobService.update(jobId, {
          status: 'failed',
          error: 'Evaluation failed: unable to reach evaluation server after multiple attempts',
          completedAt: Date.now(),
        });
        await this.markWorkflowStepFailed(job.datasetId);
        toast.error('Evaluation failed: unable to reach evaluation server');
      }
    }
  }

  private async handleJobComplete(
    jobId: string,
    result: Awaited<ReturnType<typeof getEvaluationResult>>
  ): Promise<void> {
    this.stopPolling(jobId);

    const job = await evalJobService.get(jobId);
    if (!job) return;

    try {
      if (result.status === 'failed') {
        await evalJobService.update(jobId, {
          status: 'failed',
          error: 'Evaluation failed on backend',
          completedAt: Date.now(),
        });
        await this.markWorkflowStepFailed(job.datasetId);
        toast.error('Evaluation failed');
        emitter.emit('vllora_dry_run_job_completed', {
          jobId,
          datasetId: job.datasetId,
          verdict: 'FAILED',
        });
        return;
      }

      // Build record topics mapping from database
      // This works even after page refresh since we fetch from DB
      const records = await recordService.getByDatasetId(job.datasetId);
      const recordTopics: Record<number, string> = {};
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (record.topic) {
          recordTopics[i] = record.topic;
        }
      }

      // Analyze results
      const samplePercentage = Math.round((job.sampleSize / result.total_rows) * 100);
      const evalStats = analyzeEvalResults(
        result,
        samplePercentage,
        Object.keys(recordTopics).length > 0 ? recordTopics : undefined
      );

      // Persist per-row scores to individual records
      if (result.results && result.results.length > 0) {
        const flatResults = flattenEvaluationResults(result.results);
        for (const row of flatResults) {
          if (typeof row.score === 'number' && row.dataset_row_id) {
            await recordService.updateEvalScores(
              job.datasetId,
              row.dataset_row_id,
              {
                evalScore: row.score,
              }
            );
          }
        }
      }

      // Save results to dataset
      await datasetService.updateEvalStats(job.datasetId, evalStats);

      // Update job with results (clear any previous error)
      await evalJobService.update(jobId, {
        status: 'completed',
        completedAt: Date.now(),
        result: evalStats,
        error: undefined,
      });

      // Update workflow step data on success
      try {
        const workflow = await workflowService.getByDataset(job.datasetId);
        if (workflow && workflow.currentStep === 'dry_run') {
          const allSamples = [
            ...(evalStats.sampleResults.highest || []),
            ...(evalStats.sampleResults.lowest || []),
            ...(evalStats.sampleResults.aroundMean || []),
          ];
          await workflowService.updateStepData(workflow.id, 'dryRun', {
            mean: evalStats.statistics.mean,
            std: evalStats.statistics.std,
            percentAboveZero: evalStats.statistics.percentAboveZero,
            percentPerfect: evalStats.statistics.percentPerfect,
            verdict: evalStats.diagnosis.verdict,
            sampleResults: allSamples.map((s) => ({
              recordId: s.recordId,
              prompt: '',
              response: '',
              score: s.score,
              reasoning: s.reason || '',
            })),
            recommendations: evalStats.diagnosis.recommendations || [],
          });
        }
      } catch (wfError) {
        console.error('[EvalPollingManager] Failed to update workflow:', wfError);
      }

      // Show verdict toast
      const verdict = evalStats.diagnosis.verdict;
      if (verdict === 'GO') {
        toast.success('Evaluation complete: GO - Ready for training', { duration: 5000 });
      } else if (verdict === 'WARNING') {
        toast.warning('Evaluation complete: WARNING - Review recommendations', { duration: 5000 });
      } else {
        toast.error('Evaluation complete: NO-GO - Issues detected', { duration: 5000 });
      }

      emitter.emit('vllora_dry_run_job_completed', {
        jobId,
        datasetId: job.datasetId,
        verdict,
      });
    } catch (error) {
      console.error('[EvalPollingManager] Failed to process results:', error);
      const friendly = friendlyEvalError(error);
      await evalJobService.update(jobId, {
        status: 'failed',
        error: friendly,
        completedAt: Date.now(),
      });
      await this.markWorkflowStepFailed(job.datasetId);
      toast.error('Failed to process evaluation results', { description: friendly });
    }
  }

  private async markWorkflowStepFailed(datasetId: string): Promise<void> {
    try {
      const workflow = await workflowService.getByDataset(datasetId);
      if (workflow && workflow.currentStep === 'dry_run') {
        await workflowService.markStepFailed(workflow.id);
      }
    } catch (error) {
      console.error('[EvalPollingManager] Failed to mark workflow step failed:', error);
    }
  }
}

// =============================================================================
// Export Singleton Instance
// =============================================================================

export const evalPollingManager = EvalPollingManager.getInstance();
