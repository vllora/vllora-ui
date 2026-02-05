/**
 * Dry Run Job Types
 *
 * Types for background dry run job management.
 * Jobs are stored in IndexedDB and polled in the background.
 */

import type { DryRunStats } from './dataset-types';
import type { EvaluationResultResponse } from '@/services/finetune-api';

/**
 * Status of a dry run job
 */
export type DryRunJobStatus =
  | 'pending'     // Created but not started
  | 'running'     // Evaluation in progress
  | 'completed'   // Successfully finished
  | 'failed'      // Error occurred
  | 'cancelled';  // User cancelled

/**
 * A dry run job record stored in IndexedDB
 */
export interface DryRunJob {
  /** Unique job ID (UUID) */
  id: string;

  /** Local dataset ID */
  datasetId: string;

  /** Backend dataset ID for API calls */
  backendDatasetId: string;

  /** Backend evaluation run ID */
  evaluationRunId: string;

  /** Current job status */
  status: DryRunJobStatus;

  /** Number of samples to evaluate */
  sampleSize: number;

  /** Job creation timestamp */
  createdAt: number;

  /** When evaluation actually started */
  startedAt?: number;

  /** When evaluation completed/failed */
  completedAt?: number;

  /** Latest polling snapshot from backend (real-time progress) */
  pollingSnapshot?: EvaluationResultResponse;

  /** Full dry run results (populated on completion) */
  result?: DryRunStats;

  /** Error message (populated on failure) */
  error?: string;
}

// =============================================================================
// Convenience getters for polling data (for backward compatibility)
// =============================================================================

/** Get total rows from job (from polling snapshot or default) */
export function getJobTotalRows(job: DryRunJob): number {
  return job.pollingSnapshot?.total_rows ?? 0;
}

/** Get completed rows from job */
export function getJobCompletedRows(job: DryRunJob): number {
  return (job.pollingSnapshot?.completed_rows ?? 0) + (job.pollingSnapshot?.failed_rows ?? 0);
}

/** Get failed rows from job */
export function getJobFailedRows(job: DryRunJob): number {
  return job.pollingSnapshot?.failed_rows ?? 0;
}

/** Get average score from job */
export function getJobAverageScore(job: DryRunJob): number | undefined {
  return job.pollingSnapshot?.summary?.average_score ?? undefined;
}

/** Get passed count from job */
export function getJobPassedCount(job: DryRunJob): number {
  return job.pollingSnapshot?.summary?.passed_count ?? 0;
}

/** Get failed grading count from job */
export function getJobFailedGradingCount(job: DryRunJob): number {
  return job.pollingSnapshot?.summary?.failed_count ?? 0;
}

/**
 * Parameters for starting a new dry run
 */
export interface StartDryRunParams {
  datasetId: string;
  backendDatasetId: string;
  sampleSize: number;
  /** Optional: record ID to topic mapping for per-topic analysis */
  recordTopics?: Record<string, string>;
  /** Model to use for generating responses (rollout model) */
  rolloutModel?: string;
}
