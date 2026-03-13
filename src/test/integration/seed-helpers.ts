/**
 * Integration Test Seed Helpers
 *
 * Utility functions for seeding test data via service adapters.
 */

import {
  datasetService,
  recordService,
  evalJobService,
  workflowService,
  iterationStateService,
} from '@/services/service-registry';
import type { EvaluationResultResponse, RowEpochResult } from '@/services/finetune-api';
import type { IterationHistoryEntry, IterationState } from '@/types/iteration-types';

// =============================================================================
// Types
// =============================================================================

interface SeedDatasetOpts {
  readonly id?: string;
  readonly name?: string;
  readonly evalScript?: string;
}

interface SeedRecordOpts {
  readonly id?: string;
  readonly topic?: string;
  readonly score?: number;
}

// =============================================================================
// Dataset Seeding
// =============================================================================

/** Create a dataset via the service adapter. */
export async function seedDataset(opts: SeedDatasetOpts = {}): Promise<string> {
  const dataset = await datasetService.create(
    opts.name ?? 'Test Dataset',
    'Test objective',
  );

  if (opts.evalScript) {
    await datasetService.updateEvalScript(dataset.id, opts.evalScript);
  }

  return dataset.id;
}

/** Create records for a dataset via the service adapter. */
export async function seedRecords(
  workflowId: string,
  records: readonly SeedRecordOpts[],
): Promise<string[]> {
  const created = await recordService.add(
    workflowId,
    records.map((rec) => ({
      data: {
        messages: [
          { role: 'user', content: `Question about ${rec.topic ?? 'general'}` },
          { role: 'assistant', content: 'Answer' },
        ],
      },
      topic: rec.topic ?? 'Uncategorized',
      is_generated: false,
    })),
  );

  return created.map(r => r.id);
}

// =============================================================================
// Workflow Seeding
// =============================================================================

/** Create a workflow for a dataset. */
export async function seedWorkflow(
  workflowId: string,
  opts: { trainingGoals?: string; jobId?: string } = {},
): Promise<string> {
  const workflow = await workflowService.create(workflowId, opts.trainingGoals ?? 'Test training');

  if (opts.jobId) {
    await workflowService.updateStepData(workflow.id, 'training', {
      jobId: opts.jobId,
      baseModel: 'unsloth/Qwen3.5-4B',
      status: 'completed',
      startedAt: Date.now(),
      metrics: null,
      modelId: null,
    });
  }

  return workflow.id;
}

// =============================================================================
// EvalJob Seeding
// =============================================================================

/** Create a completed EvalJob with evaluation results. */
export async function seedCompletedEvalJob(
  workflowId: string,
  opts: {
    evaluationRunId?: string;
    scores: readonly { rowId: string; score: number; topic?: string }[];
  },
): Promise<string> {
  const totalRows = opts.scores.length;
  const results: RowEpochResult[] = opts.scores.map((s, i) => ({
    row_index: i,
    row: { id: s.rowId, messages: [] },
    epochs: {
      '0': [{
        dataset_row_id: s.rowId,
        status: 'completed',
        score: s.score,
        reason: s.score >= 0.5 ? 'Meets criteria' : 'Does not meet criteria',
      }],
    },
  }));

  const avgScore = opts.scores.reduce((sum, s) => sum + s.score, 0) / totalRows;
  const passedCount = opts.scores.filter((s) => s.score > 0).length;

  const pollingSnapshot: EvaluationResultResponse = {
    evaluation_run_id: opts.evaluationRunId ?? 'eval-run-001',
    status: 'completed',
    total_rows: totalRows,
    completed_rows: totalRows,
    failed_rows: 0,
    results,
    summary: {
      average_score: avgScore,
      passed_count: passedCount,
      failed_count: totalRows - passedCount,
    },
  };

  // Create eval job record in gateway SQLite, then update with full result data.
  // The create endpoint only accepts cloud_run_id, sample_size, rollout_model.
  const job = await evalJobService.create({
    workflowId,
    evaluationRunId: opts.evaluationRunId ?? 'eval-run-001',
    status: 'pending',
    sampleSize: totalRows,
    createdAt: Date.now(),
  });

  await evalJobService.update(job.id, {
    status: 'completed',
    completedAt: Date.now(),
    pollingSnapshot,
  });

  return job.id;
}

// =============================================================================
// Iteration State Seeding
// =============================================================================

/** Seed iteration history for stall detection tests. */
export async function seedIterationHistory(
  workflowId: string,
  history: readonly IterationHistoryEntry[],
): Promise<void> {
  const state: IterationState = {
    id: workflowId,
    iterationNumber: history.length,
    phase: 'idle',
    innerLoop: {},
    outerLoop: {},
    history: [...history],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await iterationStateService.save(state);
}
