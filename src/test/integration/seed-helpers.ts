/**
 * Integration Test Seed Helpers
 *
 * Utility functions for seeding IndexedDB with test data.
 * Uses the real DB modules (backed by fake-indexeddb in tests).
 */

import { getDB as getDatasetsDB } from '@/services/datasets-db';
import { getDB as getFinetuneDB, createWorkflow } from '@/services/finetune-workflow-db';
import { createDryRunJob } from '@/services/dry-run-jobs-db';
import { saveIterationState } from '@/services/finetune-iteration-db';
import type { EvaluationResultResponse, RowEpochResult } from '@/services/finetune-api';
import type { IterationHistoryEntry, IterationState } from '@/services/finetune-iteration-db';

// =============================================================================
// Types
// =============================================================================

interface SeedDatasetOpts {
  readonly id?: string;
  readonly name?: string;
  readonly backendDatasetId?: string;
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

/** Create a dataset directly in IndexedDB. */
export async function seedDataset(opts: SeedDatasetOpts = {}): Promise<string> {
  const db = await getDatasetsDB();
  const id = opts.id ?? `ds-${crypto.randomUUID().slice(0, 8)}`;
  const now = Date.now();

  const dataset = {
    id,
    name: opts.name ?? 'Test Dataset',
    createdAt: now,
    updatedAt: now,
    backendDatasetId: opts.backendDatasetId,
    evalScript: opts.evalScript,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');
    const request = store.put(dataset);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  return id;
}

/** Create records for a dataset in IndexedDB. */
export async function seedRecords(
  datasetId: string,
  records: readonly SeedRecordOpts[],
): Promise<string[]> {
  const db = await getDatasetsDB();
  const now = Date.now();
  const ids: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');

    for (const rec of records) {
      const id = rec.id ?? `row-${ids.length}`;
      ids.push(id);

      const record = {
        id,
        datasetId,
        data: {
          messages: [
            { role: 'user', content: `Question about ${rec.topic ?? 'general'}` },
            { role: 'assistant', content: 'Answer' },
          ],
        },
        topic: rec.topic ?? 'Uncategorized',
        createdAt: now,
        updatedAt: now,
        evaluation: rec.score != null ? { dryRunScore: rec.score } : undefined,
      };

      store.put(record);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return ids;
}

// =============================================================================
// Workflow Seeding
// =============================================================================

/** Create a workflow for a dataset. */
export async function seedWorkflow(
  datasetId: string,
  opts: { trainingGoals?: string; jobId?: string } = {},
): Promise<string> {
  const workflow = await createWorkflow(datasetId, opts.trainingGoals ?? 'Test training');

  if (opts.jobId) {
    const db = await getFinetuneDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('workflows', 'readwrite');
      const store = tx.objectStore('workflows');
      const getReq = store.get(workflow.id);
      getReq.onsuccess = () => {
        const wf = getReq.result;
        wf.training = { jobId: opts.jobId, baseModel: 'unsloth/Qwen3.5-4B', status: 'succeeded' };
        store.put(wf);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return workflow.id;
}

// =============================================================================
// DryRunJob Seeding
// =============================================================================

/** Create a completed DryRunJob with evaluation results. */
export async function seedCompletedDryRunJob(
  datasetId: string,
  opts: {
    backendDatasetId?: string;
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

  const job = await createDryRunJob({
    datasetId,
    backendDatasetId: opts.backendDatasetId ?? 'ds-backend-001',
    evaluationRunId: opts.evaluationRunId ?? 'eval-run-001',
    status: 'completed',
    sampleSize: totalRows,
    createdAt: Date.now(),
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
  datasetId: string,
  history: readonly IterationHistoryEntry[],
): Promise<void> {
  const state: IterationState = {
    id: datasetId,
    iterationNumber: history.length,
    phase: 'idle',
    innerLoop: {},
    outerLoop: {},
    history: [...history],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveIterationState(state);
}
