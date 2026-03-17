/**
 * Eval Job Manager
 *
 * Singleton service that manages evaluation job lifecycle.
 *
 * Architecture:
 * - FE polls cloud-proxy for PROGRESS (in-memory only, never persisted to BE)
 * - BE state tracker handles STATUS tracking + SCORE WRITEBACK independently
 * - Internal emitter events for UI updates (no SSE)
 * - On-demand refresh when user clicks into job detail
 */

import type { StartEvalParams } from '@/types/eval-job';
import { evalJobService } from './service-registry';
import {
  createEvaluation,
  getEvaluationResult,
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

  const jsonMatch = raw.match(/\{.*"error"\s*:\s*"([^"]+)"/);
  if (jsonMatch) return jsonMatch[1];

  if (raw.length > 120) return raw.slice(0, 117) + '…';
  return raw;
}

// =============================================================================
// Constants
// =============================================================================

/** Interval for polling cloud-proxy for progress (ms) */
const POLL_INTERVAL_MS = 10_000;
/** Max consecutive cloud-proxy errors before marking job failed */
const MAX_CONSECUTIVE_ERRORS = 30;

// =============================================================================
// Singleton Class
// =============================================================================

class EvalJobManager {
  private static instance: EvalJobManager;
  private initialized = false;
  /** Active polling intervals keyed by jobId */
  private readonly pollingIntervals = new Map<string, ReturnType<typeof setInterval>>();
  /** Consecutive error count per job */
  private readonly consecutiveErrors = new Map<string, number>();

  private constructor() {}

  static getInstance(): EvalJobManager {
    if (!EvalJobManager.instance) {
      EvalJobManager.instance = new EvalJobManager();
    }
    return EvalJobManager.instance;
  }

  /**
   * Initialize the manager.
   * Cleans up stale pending jobs. Does NOT auto-start polling —
   * polling is controlled by the view (EvalJobsContext) lifecycle.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const pendingJobs = await evalJobService.getPending();

      // Clean up stale pending jobs (>60s old with no evaluation started)
      for (const job of pendingJobs) {
        if (Date.now() - job.createdAt > 60000) {
          await evalJobService.update(job.id, {
            status: 'failed',
            error: 'Job was interrupted before evaluation started',
            completedAt: Date.now(),
          });
        }
      }
    } catch (error) {
      console.error('[EvalJobManager] Failed to initialize:', error);
    }
  }

  /**
   * Create and start a new evaluation (high-level API).
   */
  async createAndStartEval(params: {
    workflowId: string;
    sampleSize: number;
    rolloutModel?: string;
  }): Promise<string> {
    const { workflowId, sampleSize, rolloutModel = 'gpt-4o-mini' } = params;

    const dataset = await datasetService.getById(workflowId);
    if (!dataset) throw new Error('Dataset not found');
    if (!dataset.evalScript) throw new Error('Grader must be configured first');

    return this.createEvalJob({ workflowId, sampleSize, rolloutModel });
  }

  /**
   * Create a new eval job. Gateway creates cloud eval + SQLite record in one call.
   * Polling is started by EvalJobsContext when it sees the running job.
   */
  async createEvalJob(params: StartEvalParams): Promise<string> {
    const { workflowId, sampleSize, rolloutModel = 'gpt-4o-mini' } = params;

    try {
      // Single call: gateway uploads dataset, creates cloud eval, saves tracking record
      const evaluationResponse = await createEvaluation({
        workflow_id: workflowId,
        rollout_model_params: { model: rolloutModel },
        offset: 0,
        limit: sampleSize,
      });

      // Fetch the eval job record the gateway just created
      const jobs = await evalJobService.getByDataset(workflowId);
      const job = jobs.find(
        (j) => j.evaluationRunId === evaluationResponse.evaluation_run_id,
      );

      if (job) {
        emitter.emit('vllora_eval_job_update', { jobId: job.id, job });
      }

      toast.info('Evaluation started in background', { duration: 3000 });
      return job?.id ?? evaluationResponse.evaluation_run_id;
    } catch (error) {
      const friendly = friendlyEvalError(error);
      toast.error('Failed to start evaluation', { description: friendly });
      throw error;
    }
  }

  /**
   * Cancel a running evaluation.
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
   * On-demand refresh: fetch fresh metrics from cloud proxy.
   * Used when user clicks into job detail or catch-up after page refresh.
   */
  async refreshJob(jobId: string): Promise<void> {
    const job = await evalJobService.get(jobId);
    if (!job || !job.evaluationRunId) return;

    const result = await getEvaluationResult(job.evaluationRunId);

    // Emit in-memory snapshot for UI (no PATCH to BE)
    const jobWithSnapshot = { ...job, pollingSnapshot: result };
    emitter.emit('vllora_eval_job_update', { jobId, job: jobWithSnapshot });

    if (
      (result.status === 'completed' || result.status === 'failed') &&
      job.status !== result.status
    ) {
      await this.handleJobComplete(jobId, result);
    }
  }

  // =============================================================================
  // Polling (cloud-proxy for progress)
  // =============================================================================

  startPolling(jobId: string): void {
    if (this.pollingIntervals.has(jobId)) return;

    this.consecutiveErrors.set(jobId, 0);

    const interval = setInterval(() => {
      this.pollJob(jobId);
    }, POLL_INTERVAL_MS);
    this.pollingIntervals.set(jobId, interval);

    // Immediate first poll
    this.pollJob(jobId);
  }

  stopPolling(jobId: string): void {
    const interval = this.pollingIntervals.get(jobId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(jobId);
    }
    this.consecutiveErrors.delete(jobId);
  }

  private async pollJob(jobId: string): Promise<void> {
    const job = await evalJobService.get(jobId);
    if (!job) {
      this.stopPolling(jobId);
      return;
    }

    // BE state tracker may have already set a terminal status before FE polled.
    // If so, do one final cloud fetch to get results before stopping.
    if (job.status !== 'running') {
      if (job.evaluationRunId) {
        try {
          const result = await getEvaluationResult(job.evaluationRunId);
          if (result.status === 'completed' || result.status === 'failed') {
            await this.handleJobComplete(jobId, result);
          }
        } catch {
          // Best-effort: if fetch fails, just stop polling
        }
      }
      this.stopPolling(jobId);
      return;
    }

    try {
      // Fetch progress from cloud via gateway proxy
      const result = await getEvaluationResult(job.evaluationRunId);

      this.consecutiveErrors.set(jobId, 0);

      // Emit in-memory snapshot for progress UI (no PATCH to BE — BE has its own polling)
      const jobWithSnapshot = { ...job, pollingSnapshot: result };
      emitter.emit('vllora_eval_job_update', { jobId, job: jobWithSnapshot });

      // Notify records table if scores are available
      if ((result.completed_rows ?? 0) > 0) {
        emitter.emit('vllora_record_scores_updated', {
          workflowId: job.workflowId,
          scoreType: 'eval',
        });
      }

      // If cloud says done, process results
      if (result.status === 'completed' || result.status === 'failed') {
        await this.handleJobComplete(jobId, result);
      }
    } catch (error) {
      console.error(`[EvalJobManager] Poll failed for ${jobId}:`, error);

      const errorCount = (this.consecutiveErrors.get(jobId) ?? 0) + 1;
      this.consecutiveErrors.set(jobId, errorCount);

      if (errorCount >= MAX_CONSECUTIVE_ERRORS) {
        this.stopPolling(jobId);
        const lastError = error instanceof Error ? error.message : String(error);
        const errorMsg = lastError.includes('not found')
          ? `Evaluation run not found on server (ID: ${job.evaluationRunId})`
          : `Unable to reach evaluation server: ${lastError}`;
        const unreachableJob = await evalJobService.update(jobId, {
          status: 'failed',
          error: errorMsg,
          completedAt: Date.now(),
        });
        if (unreachableJob) {
          emitter.emit('vllora_eval_job_update', { jobId, job: unreachableJob });
        }
        await this.markWorkflowStepFailed(job.workflowId);
        toast.error(`Evaluation failed: ${errorMsg}`);
      }
    }
  }

  // =============================================================================
  // Completion handling
  // =============================================================================

  private async handleJobComplete(
    jobId: string,
    result: Awaited<ReturnType<typeof getEvaluationResult>>
  ): Promise<void> {
    this.stopPolling(jobId);

    const job = await evalJobService.get(jobId);
    if (!job) return;

    try {
      if (result.status === 'failed') {
        // Extract error detail from cloud response
        const failedCount = result.failed_rows ?? 0;
        const totalCount = result.total_rows ?? 0;
        const cloudError = (result as unknown as Record<string, unknown>).error;
        const errorDetail = typeof cloudError === 'string'
          ? cloudError
          : failedCount > 0
            ? `${failedCount}/${totalCount} rows failed during evaluation`
            : 'Evaluation failed on the cloud server';

        const failedJob = await evalJobService.update(jobId, {
          status: 'failed',
          error: errorDetail,
          completedAt: Date.now(),
        });
        if (failedJob) {
          emitter.emit('vllora_eval_job_update', { jobId, job: failedJob });
        }
        await this.markWorkflowStepFailed(job.workflowId);
        toast.error(`Evaluation failed: ${errorDetail}`);
        emitter.emit('vllora_eval_job_completed', {
          jobId,
          workflowId: job.workflowId,
          verdict: 'FAILED',
        });
        return;
      }

      // Build record topics mapping
      const records = await recordService.getByDatasetId(job.workflowId);
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

      await datasetService.updateEvalStats(job.workflowId, evalStats);

      const completedJob = await evalJobService.update(jobId, {
        status: 'completed',
        completedAt: Date.now(),
        result: evalStats,
        error: undefined,
      });
      if (completedJob) {
        emitter.emit('vllora_eval_job_update', { jobId, job: completedJob });
      }

      // Update workflow step data
      try {
        const workflow = await workflowService.getByDataset(job.workflowId);
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
        console.error('[EvalJobManager] Failed to update workflow:', wfError);
      }

      const verdict = evalStats.diagnosis.verdict;
      if (verdict === 'GO') {
        toast.success('Evaluation complete: GO - Ready for training', { duration: 5000 });
      } else if (verdict === 'WARNING') {
        toast.warning('Evaluation complete: WARNING - Review recommendations', { duration: 5000 });
      } else {
        toast.error('Evaluation complete: NO-GO - Issues detected', { duration: 5000 });
      }

      emitter.emit('vllora_eval_job_completed', {
        jobId,
        workflowId: job.workflowId,
        verdict,
      });
    } catch (error) {
      console.error('[EvalJobManager] Failed to process results:', error);
      const friendly = friendlyEvalError(error);
      const errorJob = await evalJobService.update(jobId, {
        status: 'failed',
        error: friendly,
        completedAt: Date.now(),
      });
      if (errorJob) {
        emitter.emit('vllora_eval_job_update', { jobId, job: errorJob });
      }
      await this.markWorkflowStepFailed(job.workflowId);
      toast.error('Failed to process evaluation results', { description: friendly });
    }
  }

  private async markWorkflowStepFailed(workflowId: string): Promise<void> {
    try {
      const workflow = await workflowService.getByDataset(workflowId);
      if (workflow && workflow.currentStep === 'dry_run') {
        await workflowService.markStepFailed(workflow.id);
      }
    } catch (error) {
      console.error('[EvalJobManager] Failed to mark workflow step failed:', error);
    }
  }
}

// =============================================================================
// Export Singleton Instance
// =============================================================================

export const evalPollingManager = EvalJobManager.getInstance();
