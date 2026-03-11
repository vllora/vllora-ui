/**
 * Eval Job Types
 *
 * Types for background evaluation job management.
 * Jobs are stored in IndexedDB and polled in the background.
 */

import type { EvalStats } from './dataset-types';
import type { EvaluationResultResponse } from '@/services/finetune-api';

/**
 * Status of an evaluation job
 */
export type EvalJobStatus =
  | 'pending'     // Created but not started
  | 'running'     // Evaluation in progress
  | 'completed'   // Successfully finished
  | 'failed'      // Error occurred
  | 'cancelled';  // User cancelled

/**
 * An evaluation job record stored in IndexedDB
 */
export interface EvalJob {
  /** Unique job ID (UUID) */
  id: string;

  /** Local dataset ID */
  datasetId: string;

  /** Backend dataset ID for API calls */
  backendDatasetId: string;

  /** Backend evaluation run ID */
  evaluationRunId: string;

  /** Current job status */
  status: EvalJobStatus;

  /** Number of samples to evaluate */
  sampleSize: number;

  /** Rollout model used for generating responses */
  rolloutModel?: string;

  /** Job creation timestamp */
  createdAt: number;

  /** When evaluation actually started */
  startedAt?: number;

  /** When evaluation completed/failed */
  completedAt?: number;

  /** Latest polling snapshot from backend (real-time progress) */
  pollingSnapshot?: EvaluationResultResponse;

  /** Full evaluation results (populated on completion) */
  result?: EvalStats;

  /** Error message (populated on failure) */
  error?: string;

  /** Whether Lucy has presented these results to the user */
  reviewedByAgent?: boolean;

  /** When Lucy presented the results (epoch ms) */
  reviewedByAgentAt?: number;
}

// =============================================================================
// Convenience getters for polling data (for backward compatibility)
// =============================================================================

/** Get total rows from job (from polling snapshot or default) */
export function getJobTotalRows(job: EvalJob): number {
  return job.pollingSnapshot?.total_rows ?? 0;
}

/** Get completed rows from job */
export function getJobCompletedRows(job: EvalJob): number {
  return (job.pollingSnapshot?.completed_rows ?? 0) + (job.pollingSnapshot?.failed_rows ?? 0);
}

/** Get failed rows from job */
export function getJobFailedRows(job: EvalJob): number {
  return job.pollingSnapshot?.failed_rows ?? 0;
}

/** Get average score from job */
export function getJobAverageScore(job: EvalJob): number | undefined {
  return job.pollingSnapshot?.summary?.average_score ?? undefined;
}

/** Get passed count from job */
export function getJobPassedCount(job: EvalJob): number {
  return job.pollingSnapshot?.summary?.passed_count ?? 0;
}

/** Get failed grading count from job */
export function getJobFailedGradingCount(job: EvalJob): number {
  return job.pollingSnapshot?.summary?.failed_count ?? 0;
}

/**
 * Parameters for starting a new evaluation
 */
export interface StartEvalParams {
  datasetId: string;
  backendDatasetId: string;
  sampleSize: number;
  /** Model to use for generating responses (rollout model) */
  rolloutModel?: string;
}
