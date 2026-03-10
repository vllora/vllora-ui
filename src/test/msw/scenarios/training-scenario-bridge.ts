/**
 * Training Scenario Bridge
 *
 * Converts training scenario keys into raw HTTP response shapes
 * (what finetune-api.ts functions return from the backend).
 */

import type {
  FinetuneJob,
  FinetuneEvalResultsResponse,
  RowEpochResults,
  ReinforcementJobMetricsResponse,
  TrainingMetricsSnapshot,
} from '@/services/finetune-api';
import type { TrainingScenarioKey } from './scenario-registry';

// =============================================================================
// Per-epoch scores for each scenario
// =============================================================================

const TRAINING_EPOCH_SCORES: Record<
  Exclude<TrainingScenarioKey, 'error'>,
  { epochs: number; rowScores: Record<number, number[]> }
> = {
  improving: {
    epochs: 3,
    // Backend uses 0-based epochs; frontend displays as epoch+1
    rowScores: {
      0: [0.38, 0.32, 0.35, 0.40, 0.30],
      1: [0.55, 0.48, 0.50, 0.52, 0.45],
      2: [0.68, 0.58, 0.60, 0.65, 0.55],
    },
  },
  overfitting: {
    epochs: 4,
    rowScores: {
      0: [0.42, 0.38, 0.40, 0.44, 0.36],
      1: [0.58, 0.52, 0.55, 0.56, 0.50],
      2: [0.50, 0.45, 0.48, 0.47, 0.42],
      3: [0.40, 0.36, 0.38, 0.39, 0.34],
    },
  },
  noLearning: {
    epochs: 3,
    rowScores: {
      0: [0.30, 0.28, 0.32, 0.31, 0.29],
      1: [0.31, 0.29, 0.33, 0.30, 0.30],
      2: [0.30, 0.28, 0.32, 0.31, 0.29],
    },
  },
};

// =============================================================================
// Job Response Builders
// =============================================================================

export function makeCreateTrainingResponse(
  jobId = 'ft-job-001',
): FinetuneJob {
  return {
    id: jobId,
    provider_job_id: `prov-${jobId}`,
    dataset_id: 'ds-backend-001',
    status: 'pending',
    base_model: 'unsloth/Qwen3.5-4B',
    provider: 'test',
    training_file_id: 'file-001',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function makeRunningTrainingResponse(
  jobId = 'ft-job-001',
): FinetuneJob {
  return {
    ...makeCreateTrainingResponse(jobId),
    status: 'running',
  };
}

export function makeCompletedTrainingResponse(
  jobId = 'ft-job-001',
): FinetuneJob {
  return {
    ...makeCreateTrainingResponse(jobId),
    status: 'succeeded',
    fine_tuned_model: `ft:test:${jobId}`,
    completed_at: new Date().toISOString(),
  };
}

export function makeFailedTrainingResponse(
  jobId = 'ft-job-001',
  errorMessage = 'Training failed: insufficient credits',
): FinetuneJob {
  return {
    ...makeCreateTrainingResponse(jobId),
    status: 'failed',
    error_message: errorMessage,
  };
}

// =============================================================================
// Poll Resolver (single source of truth for training polling logic)
// =============================================================================

/**
 * Resolves what response to return for a training poll request.
 * Used by both MSW handlers and Express mock server — keeps routing logic in one place.
 */
export function resolveTrainingPollResponse(
  jobId: string,
  trainingScenario: TrainingScenarioKey,
  pollCount: number,
  pollsBeforeComplete: number,
): FinetuneJob {
  // Still running — not enough polls yet
  if (pollCount <= pollsBeforeComplete) {
    return makeRunningTrainingResponse(jobId);
  }

  // Error scenario → failed
  if (trainingScenario === 'error') {
    return makeFailedTrainingResponse(jobId);
  }

  // Completed
  return makeCompletedTrainingResponse(jobId);
}

// =============================================================================
// Finetune Evaluation Response (per-epoch training eval data)
// =============================================================================

export function makeFinetuneEvalResponse(
  scenario: TrainingScenarioKey,
  rowCount = 5,
  /** Real record IDs from the uploaded JSONL. Falls back to `row-N` if empty. */
  rowIds: string[] = [],
): FinetuneEvalResultsResponse {
  if (scenario === 'error') {
    return { results: [] };
  }

  const config = TRAINING_EPOCH_SCORES[scenario];
  const results: RowEpochResults[] = Array.from({ length: rowCount }, (_, i) => {
    const rowId = rowIds[i] ?? `row-${i}`;
    const epochs: Record<number, Array<{ score: number; status: string }>> = {};
    for (let epoch = 0; epoch < config.epochs; epoch++) {
      const scores = config.rowScores[epoch] ?? [];
      epochs[epoch] = [{
        score: scores[i % scores.length],
        status: 'completed',
      }];
    }
    return {
      row_index: i,
      row: { id: rowId, messages: [] },
      epochs,
    };
  });

  return { results };
}

// =============================================================================
// Reinforcement Training Metrics (GRPO/GSPO telemetry)
// =============================================================================

/** Per-scenario training metrics progression */
const TRAINING_METRICS: Record<
  Exclude<TrainingScenarioKey, 'error'>,
  TrainingMetricsSnapshot[]
> = {
  improving: [
    { global_step: 1, max_steps: 30, epoch: 0.03, learning_rate: 0.000001, reward: 0.35, reward_std: 0.18, frac_reward_zero_std: 0.2, loss: 0.08, kl: 5.2, grad_norm: 1.1, 'completions/clipped_ratio': 0.3, 'completions/mean_length': 450, 'completions/mean_terminated_length': 380 },
    { global_step: 5, max_steps: 30, epoch: 0.17, learning_rate: 0.000005, reward: 0.45, reward_std: 0.15, frac_reward_zero_std: 0.18, loss: 0.06, kl: 8.1, grad_norm: 1.0, 'completions/clipped_ratio': 0.25, 'completions/mean_length': 420, 'completions/mean_terminated_length': 390 },
    { global_step: 10, max_steps: 30, epoch: 0.33, learning_rate: 0.00001, reward: 0.52, reward_std: 0.12, frac_reward_zero_std: 0.15, loss: 0.05, kl: 10.5, grad_norm: 0.9, 'completions/clipped_ratio': 0.2, 'completions/mean_length': 400, 'completions/mean_terminated_length': 380 },
    { global_step: 15, max_steps: 30, epoch: 0.50, learning_rate: 0.00001, reward: 0.58, reward_std: 0.10, frac_reward_zero_std: 0.12, loss: 0.04, kl: 12.3, grad_norm: 0.85, 'completions/clipped_ratio': 0.15, 'completions/mean_length': 380, 'completions/mean_terminated_length': 370 },
    { global_step: 20, max_steps: 30, epoch: 0.67, learning_rate: 0.000008, reward: 0.63, reward_std: 0.09, frac_reward_zero_std: 0.10, loss: 0.035, kl: 14.0, grad_norm: 0.80, 'completions/clipped_ratio': 0.12, 'completions/mean_length': 370, 'completions/mean_terminated_length': 360 },
    { global_step: 25, max_steps: 30, epoch: 0.83, learning_rate: 0.000005, reward: 0.67, reward_std: 0.08, frac_reward_zero_std: 0.08, loss: 0.03, kl: 15.2, grad_norm: 0.78, 'completions/clipped_ratio': 0.10, 'completions/mean_length': 360, 'completions/mean_terminated_length': 350 },
    { global_step: 30, max_steps: 30, epoch: 1.0, learning_rate: 0.000002, reward: 0.70, reward_std: 0.07, frac_reward_zero_std: 0.06, loss: 0.028, kl: 16.0, grad_norm: 0.75, 'completions/clipped_ratio': 0.08, 'completions/mean_length': 350, 'completions/mean_terminated_length': 345 },
  ],
  overfitting: [
    { global_step: 1, max_steps: 40, epoch: 0.025, learning_rate: 0.00002, reward: 0.40, reward_std: 0.20, frac_reward_zero_std: 0.15, loss: 0.07, kl: 6.0, grad_norm: 1.2, 'completions/clipped_ratio': 0.25, 'completions/mean_length': 440, 'completions/mean_terminated_length': 400 },
    { global_step: 10, max_steps: 40, epoch: 0.25, learning_rate: 0.00002, reward: 0.55, reward_std: 0.14, frac_reward_zero_std: 0.12, loss: 0.05, kl: 18.0, grad_norm: 1.5, 'completions/clipped_ratio': 0.20, 'completions/mean_length': 410, 'completions/mean_terminated_length': 380 },
    { global_step: 20, max_steps: 40, epoch: 0.50, learning_rate: 0.00002, reward: 0.62, reward_std: 0.10, frac_reward_zero_std: 0.10, loss: 0.04, kl: 28.0, grad_norm: 2.0, 'completions/clipped_ratio': 0.18, 'completions/mean_length': 400, 'completions/mean_terminated_length': 370 },
    { global_step: 30, max_steps: 40, epoch: 0.75, learning_rate: 0.00002, reward: 0.55, reward_std: 0.22, frac_reward_zero_std: 0.25, loss: 0.06, kl: 42.0, grad_norm: 3.5, 'completions/clipped_ratio': 0.35, 'completions/mean_length': 450, 'completions/mean_terminated_length': 350 },
    { global_step: 40, max_steps: 40, epoch: 1.0, learning_rate: 0.00001, reward: 0.48, reward_std: 0.28, frac_reward_zero_std: 0.35, loss: 0.08, kl: 55.0, grad_norm: 4.2, 'completions/clipped_ratio': 0.45, 'completions/mean_length': 480, 'completions/mean_terminated_length': 320 },
  ],
  noLearning: [
    { global_step: 1, max_steps: 30, epoch: 0.03, learning_rate: 0.000001, reward: 0.30, reward_std: 0.05, frac_reward_zero_std: 0.55, loss: 0.09, kl: 2.0, grad_norm: 0.5, 'completions/clipped_ratio': 0.80, 'completions/mean_length': 768, 'completions/mean_terminated_length': 0 },
    { global_step: 10, max_steps: 30, epoch: 0.33, learning_rate: 0.00001, reward: 0.31, reward_std: 0.04, frac_reward_zero_std: 0.60, loss: 0.085, kl: 2.5, grad_norm: 0.45, 'completions/clipped_ratio': 0.85, 'completions/mean_length': 768, 'completions/mean_terminated_length': 0 },
    { global_step: 20, max_steps: 30, epoch: 0.67, learning_rate: 0.000008, reward: 0.30, reward_std: 0.04, frac_reward_zero_std: 0.62, loss: 0.088, kl: 2.8, grad_norm: 0.42, 'completions/clipped_ratio': 0.88, 'completions/mean_length': 768, 'completions/mean_terminated_length': 0 },
    { global_step: 30, max_steps: 30, epoch: 1.0, learning_rate: 0.000002, reward: 0.31, reward_std: 0.03, frac_reward_zero_std: 0.65, loss: 0.087, kl: 3.0, grad_norm: 0.40, 'completions/clipped_ratio': 0.90, 'completions/mean_length': 768, 'completions/mean_terminated_length': 0 },
  ],
};

/**
 * Build mock reinforcement training metrics response for a job.
 * Returns scenario-appropriate time series of GRPO metrics.
 */
export function makeReinforcementMetricsResponse(
  jobId: string,
  scenario: TrainingScenarioKey,
): ReinforcementJobMetricsResponse {
  if (scenario === 'error') {
    return { provider_job_id: jobId, metrics: [] };
  }

  const snapshots = TRAINING_METRICS[scenario];
  const baseTime = new Date('2026-03-10T10:00:00Z');

  const metrics = snapshots.map((snapshot, idx) => ({
    metrics: snapshot,
    created_at: new Date(baseTime.getTime() + idx * 60_000).toISOString(),
  }));

  return { provider_job_id: jobId, metrics };
}
