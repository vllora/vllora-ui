/**
 * Eval Scenario Bridge
 *
 * Converts eval scenario keys into raw HTTP response shapes
 * (what finetune-api.ts functions return from the backend).
 *
 * The EVAL_SCENARIOS fixtures represent analyze_evaluation output.
 * This bridge produces the upstream HTTP responses that would
 * ultimately yield those analysis results.
 */

import type {
  CreateEvaluationResponse,
  EvaluationResultResponse,
  RowEpochResult,
  DatasetUploadResponse,
} from '@/services/finetune-api';
import type { EvalScenarioKey } from './scenario-registry';

// =============================================================================
// Score Maps (scenario → representative scores)
// =============================================================================

const SCENARIO_SCORES: Record<EvalScenarioKey, { mean: number; scores: number[] }> = {
  healthy: {
    mean: 0.65,
    scores: [0.72, 0.61, 0.58, 0.70, 0.65, 0.68, 0.55, 0.60, 0.75, 0.62],
  },
  warning: {
    mean: 0.42,
    scores: [0.65, 0.35, 0.22, 0.50, 0.40, 0.38, 0.55, 0.28, 0.45, 0.42],
  },
  critical: {
    mean: 0.18,
    scores: [0.15, 0.20, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0],
  },
  stalled: {
    mean: 0.45,
    scores: [0.48, 0.42, 0.45, 0.44, 0.46, 0.43, 0.47, 0.45, 0.44, 0.46],
  },
  error: {
    mean: 0,
    scores: [],
  },
};

// =============================================================================
// Response Builders
// =============================================================================

export function makeUploadResponse(datasetId = 'ds-backend-001'): DatasetUploadResponse {
  return { dataset_id: datasetId };
}

export function makeCreateEvalResponse(
  totalRows = 10,
  runId = 'eval-run-001',
): CreateEvaluationResponse {
  return {
    evaluation_run_id: runId,
    status: 'running',
    total_rows: totalRows,
  };
}

export function makeRunningEvalResponse(
  runId: string,
  completedRows: number,
  totalRows: number,
): EvaluationResultResponse {
  return {
    evaluation_run_id: runId,
    status: 'running',
    total_rows: totalRows,
    completed_rows: completedRows,
    failed_rows: 0,
    results: [],
    summary: null,
  };
}

export function makeCompletedEvalResponse(
  scenario: EvalScenarioKey,
  runId = 'eval-run-001',
  totalRows = 10,
): EvaluationResultResponse {
  const { mean, scores } = SCENARIO_SCORES[scenario];

  const results: RowEpochResult[] = scores.slice(0, totalRows).map((score, i) => ({
    row_index: i,
    row: { id: `row-${i}`, messages: [] },
    epochs: {
      '0': [{
        dataset_row_id: `row-${i}`,
        status: 'completed',
        score,
        reason: score >= 0.5 ? 'Meets criteria' : 'Does not meet criteria',
      }],
    },
  }));

  const passedCount = scores.filter((s) => s > 0).length;

  return {
    evaluation_run_id: runId,
    status: 'completed',
    total_rows: totalRows,
    completed_rows: totalRows,
    failed_rows: 0,
    results,
    summary: {
      average_score: mean,
      passed_count: passedCount,
      failed_count: totalRows - passedCount,
    },
  };
}

export function makeFailedEvalResponse(runId = 'eval-run-001'): EvaluationResultResponse {
  return {
    evaluation_run_id: runId,
    status: 'failed',
    total_rows: 0,
    completed_rows: 0,
    failed_rows: 0,
    results: [],
    summary: null,
  };
}
