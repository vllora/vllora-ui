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
