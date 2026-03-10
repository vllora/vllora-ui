/**
 * Finetune API Mock
 *
 * Configurable mock for finetune-api.ts service functions.
 * Supports realistic async delays to simulate backend latency.
 *
 * Usage:
 *   vi.mock('@/services/finetune-api', () => mockFinetuneApi());
 *   // Or with custom delays:
 *   vi.mock('@/services/finetune-api', () => mockFinetuneApi({ delayMs: 100 }));
 */

import { vi } from 'vitest';
import { makeEvalRecords, type MockEvalRecord } from '../fixtures/eval-scenarios';

// =============================================================================
// Delay Helper
// =============================================================================

/** Default delay to simulate network latency (ms). Set to 0 for instant in fast tests. */
const DEFAULT_DELAY_MS = 50;

/** Create a delayed promise — simulates BE response time. */
function delayed<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// =============================================================================
// Default Mock Responses
// =============================================================================

const DEFAULT_BACKEND_DATASET_ID = 'backend-ds-001';
const DEFAULT_EVAL_RUN_ID = 'eval-run-001';

function defaultEvalResults(records?: readonly MockEvalRecord[]) {
  const data = records ?? makeEvalRecords(5, { meanScore: 0.5 });
  return {
    evaluation_run_id: DEFAULT_EVAL_RUN_ID,
    status: 'completed',
    total_rows: data.length,
    completed_rows: data.length,
    failed_rows: 0,
    results: data.map((r) => ({
      dataset_row_id: r.dataset_row_id,
      row_index: r.row_index,
      epochs: [{ epoch: 1, score: r.score, reason: r.reason, status: r.status }],
    })),
  };
}

// =============================================================================
// Mock Factory
// =============================================================================

export interface MockFinetuneApiOptions {
  /** Delay for each mock call in ms (default: 50). Set 0 for instant. */
  readonly delayMs?: number;
  /** Override eval results for specific scenarios. */
  readonly evalResults?: ReturnType<typeof defaultEvalResults>;
  /** Override backend dataset ID. */
  readonly backendDatasetId?: string;
  /** Simulate evaluation failure. */
  readonly evalShouldFail?: boolean;
  /** Simulate upload failure. */
  readonly uploadShouldFail?: boolean;
}

export function mockFinetuneApi(opts: MockFinetuneApiOptions = {}) {
  const ms = opts.delayMs ?? DEFAULT_DELAY_MS;
  const backendId = opts.backendDatasetId ?? DEFAULT_BACKEND_DATASET_ID;
  const evalResults = opts.evalResults ?? defaultEvalResults();

  return {
    // Dataset upload
    ensureDatasetUploaded: vi.fn().mockImplementation(() => {
      if (opts.uploadShouldFail) {
        return delayed(Promise.reject(new Error('Upload failed')), ms);
      }
      return delayed(backendId, ms);
    }),

    uploadDataset: vi.fn().mockImplementation(() =>
      delayed({ dataset_id: backendId }, ms),
    ),

    uploadDatasetForFinetune: vi.fn().mockImplementation(() =>
      delayed({ backendDatasetId: backendId, jsonlContent: '{}' }, ms),
    ),

    // Evaluator
    updateDatasetEvalScript: vi.fn().mockImplementation(() =>
      delayed({ success: true }, ms),
    ),

    // Evaluation
    createEvaluation: vi.fn().mockImplementation(() => {
      if (opts.evalShouldFail) {
        return delayed({ evaluation_run_id: DEFAULT_EVAL_RUN_ID, status: 'failed', total_rows: 0 }, ms);
      }
      return delayed({ evaluation_run_id: DEFAULT_EVAL_RUN_ID, status: 'running', total_rows: evalResults.total_rows }, ms);
    }),

    waitForEvaluationComplete: vi.fn().mockImplementation(() => {
      if (opts.evalShouldFail) {
        return delayed({ ...evalResults, status: 'failed', results: [] }, ms);
      }
      return delayed(evalResults, ms);
    }),

    getEvaluationResult: vi.fn().mockImplementation(() =>
      delayed(evalResults, ms),
    ),

    flattenEvaluationResults: vi.fn().mockImplementation((results: unknown[]) => {
      // Use real flattening logic for accuracy
      return (results as Array<{ dataset_row_id: string; row_index: number; epochs: Array<{ score: number; reason: string; status: string }> }>).map((r) => ({
        dataset_row_id: r.dataset_row_id,
        row_index: r.row_index,
        score: r.epochs[0]?.score ?? 0,
        reason: r.epochs[0]?.reason ?? '',
        status: r.epochs[0]?.status ?? 'completed',
      }));
    }),

    getDryRunAnalytics: vi.fn().mockImplementation(() =>
      delayed({ diagnosis: { verdict: 'HEALTHY', mean: 0.5 } }, ms),
    ),

    // Training
    createReinforcementJob: vi.fn().mockImplementation(() =>
      delayed({ id: 'ft-job-001', status: 'running' }, ms),
    ),

    getReinforcementJobStatus: vi.fn().mockImplementation(() =>
      delayed({ id: 'ft-job-001', status: 'succeeded' }, ms),
    ),

    listReinforcementJobs: vi.fn().mockImplementation(() =>
      delayed([], ms),
    ),

    getFinetuneEvaluations: vi.fn().mockImplementation(() =>
      delayed({ results: [] }, ms),
    ),

    // Evaluator versions
    getEvaluatorVersions: vi.fn().mockImplementation(() =>
      delayed([
        { id: 'ev-002', dataset_id: backendId, version: 2, config: { type: 'js', config: {} }, diff: '+ new line', created_at: '2026-03-10T12:00:00Z' },
        { id: 'ev-001', dataset_id: backendId, version: 1, config: { type: 'js', config: {} }, diff: null, created_at: '2026-03-09T10:00:00Z' },
      ], ms),
    ),

    // Reinforcement training metrics
    getReinforcementJobMetrics: vi.fn().mockImplementation(() =>
      delayed({ provider_job_id: 'ft-job-001', metrics: [] }, ms),
    ),
  };
}

// =============================================================================
// Convenience: Create mock with specific eval scenario
// =============================================================================

export function mockApiWithEvalRecords(
  records: readonly MockEvalRecord[],
  delayMs = DEFAULT_DELAY_MS,
) {
  return mockFinetuneApi({
    delayMs,
    evalResults: defaultEvalResults(records),
  });
}

export function mockApiWithFailure(delayMs = DEFAULT_DELAY_MS) {
  return mockFinetuneApi({ delayMs, evalShouldFail: true });
}
