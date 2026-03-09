/**
 * Training Analysis Integration Tests
 *
 * Tests the analyze_training tool handler with real IndexedDB data
 * and MSW-mocked HTTP responses for training job status and
 * per-epoch finetune evaluation data.
 *
 * MSW handlers serve:
 *   GET /finetune/reinforcement-jobs/:jobId/status
 *   GET /finetune/datasets/:id/finetune-evaluations
 */

import { describe, it, expect } from 'vitest';
import { analyzeTrainingHandler } from '@/lib/distri-finetune-tools/steps/analyze-training';
import { seedDataset, seedRecords, seedWorkflow } from './seed-helpers';
import { setScenario } from '../msw/scenarios/scenario-registry';
import type { TopicEpochProgression, TrainingPattern } from '@/lib/distri-finetune-tools/types';

// =============================================================================
// Helpers
// =============================================================================

/** Seed a full training scenario: dataset + records + workflow with jobId. */
async function seedTrainingScenario(opts: {
  topics?: readonly string[];
  rowCount?: number;
} = {}) {
  const topics = opts.topics ?? ['Pins', 'Forks'];
  const rowCount = opts.rowCount ?? 5;
  const backendDatasetId = 'ds-backend-001';
  const jobId = 'ft-job-001';

  const datasetId = await seedDataset({ backendDatasetId });

  // Seed records with row IDs matching MSW response (row-0, row-1, ...)
  const records = Array.from({ length: rowCount }, (_, i) => ({
    id: `row-${i}`,
    topic: topics[i % topics.length],
  }));
  await seedRecords(datasetId, records);

  // Create workflow with training jobId
  await seedWorkflow(datasetId, { jobId });

  return { datasetId, backendDatasetId, jobId };
}

// =============================================================================
// Tests
// =============================================================================

describe('analyze_training integration (MSW)', () => {
  // ---------------------------------------------------------------------------
  // Improving scenario — all topics learning
  // ---------------------------------------------------------------------------

  it('returns deploy_eval for improving training', async () => {
    const { datasetId, jobId } = await seedTrainingScenario();

    setScenario({
      trainingScenario: 'improving',
      trainingPollsBeforeComplete: 0,
    });

    const result = await analyzeTrainingHandler({
      dataset_id: datasetId,
      job_id: jobId,
    }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.job_status).toBe('succeeded');
    expect(result.total_epochs).toBe(3);
    expect(result.total_rows).toBe(5);

    const patterns = result.patterns_detected as TrainingPattern[];
    expect(patterns).toContain('all_improving');

    expect(result.next_action).toBe('deploy_eval');
  });

  // ---------------------------------------------------------------------------
  // Overfitting scenario — scores rise then fall
  // ---------------------------------------------------------------------------

  it('returns investigate for overfitting training', async () => {
    const { datasetId, jobId } = await seedTrainingScenario();

    setScenario({
      trainingScenario: 'overfitting',
      trainingPollsBeforeComplete: 0,
    });

    const result = await analyzeTrainingHandler({
      dataset_id: datasetId,
      job_id: jobId,
    }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.job_status).toBe('succeeded');
    expect(result.total_epochs).toBe(4);

    const patterns = result.patterns_detected as TrainingPattern[];
    expect(patterns).toContain('overfitting');

    expect(result.next_action).toBe('investigate');

    // Should have high-priority recommendation about overfitting
    const recs = result.recommendations as Array<{ priority: string; action: string }>;
    const overfitRec = recs.find((r) => r.action.includes('Overfitting'));
    expect(overfitRec).toBeDefined();
    expect(overfitRec!.priority).toBe('high');
  });

  // ---------------------------------------------------------------------------
  // No learning scenario — flat scores
  // ---------------------------------------------------------------------------

  it('returns inner_loop for no-learning training', async () => {
    const { datasetId, jobId } = await seedTrainingScenario();

    setScenario({
      trainingScenario: 'noLearning',
      trainingPollsBeforeComplete: 0,
    });

    const result = await analyzeTrainingHandler({
      dataset_id: datasetId,
      job_id: jobId,
    }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.job_status).toBe('succeeded');

    const patterns = result.patterns_detected as TrainingPattern[];
    expect(patterns).toContain('no_learning');

    expect(result.next_action).toBe('inner_loop');

    // Should have recommendation about checking records/grader
    const recs = result.recommendations as Array<{ action: string }>;
    const noLearnRec = recs.find((r) => r.action.includes('No learning'));
    expect(noLearnRec).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Failed training job
  // ---------------------------------------------------------------------------

  it('returns retrain for failed training job', async () => {
    const { datasetId, jobId } = await seedTrainingScenario();

    setScenario({
      trainingScenario: 'error',
      trainingPollsBeforeComplete: 0,
    });

    const result = await analyzeTrainingHandler({
      dataset_id: datasetId,
      job_id: jobId,
    }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.job_status).toBe('failed');
    expect(result.next_action).toBe('retrain');

    const patterns = result.patterns_detected as TrainingPattern[];
    expect(patterns).toContain('training_failure');
  });

  // ---------------------------------------------------------------------------
  // Per-topic progressions
  // ---------------------------------------------------------------------------

  it('includes per-topic epoch progressions', async () => {
    const { datasetId, jobId } = await seedTrainingScenario({
      topics: ['Pins', 'Forks'],
      rowCount: 5,
    });

    setScenario({
      trainingScenario: 'improving',
      trainingPollsBeforeComplete: 0,
    });

    const result = await analyzeTrainingHandler({
      dataset_id: datasetId,
      job_id: jobId,
    }) as Record<string, unknown>;

    expect(result.success).toBe(true);

    const perTopic = result.per_topic as TopicEpochProgression[];
    expect(perTopic.length).toBe(2);

    const pins = perTopic.find((t) => t.topic === 'Pins');
    const forks = perTopic.find((t) => t.topic === 'Forks');
    expect(pins).toBeDefined();
    expect(forks).toBeDefined();

    // Improving scenario: last_epoch_score > first_epoch_score
    expect(pins!.last_epoch_score).toBeGreaterThan(pins!.first_epoch_score);
    expect(forks!.last_epoch_score).toBeGreaterThan(forks!.first_epoch_score);
  });

  // ---------------------------------------------------------------------------
  // Overall progression
  // ---------------------------------------------------------------------------

  it('computes overall progression with positive delta', async () => {
    const { datasetId, jobId } = await seedTrainingScenario();

    setScenario({
      trainingScenario: 'improving',
      trainingPollsBeforeComplete: 0,
    });

    const result = await analyzeTrainingHandler({
      dataset_id: datasetId,
      job_id: jobId,
    }) as Record<string, unknown>;

    expect(result.success).toBe(true);

    const overall = result.overall_progression as {
      first_epoch_mean: number;
      last_epoch_mean: number;
      delta: number;
    };
    expect(overall).toBeDefined();
    expect(overall.delta).toBeGreaterThan(0);
    expect(overall.last_epoch_mean).toBeGreaterThan(overall.first_epoch_mean);
  });

  // ---------------------------------------------------------------------------
  // Error — dataset without backendDatasetId
  // ---------------------------------------------------------------------------

  it('returns error when dataset has no backendDatasetId', async () => {
    const datasetId = await seedDataset({ backendDatasetId: undefined });
    await seedRecords(datasetId, [{ topic: 'Pins' }]);

    const result = await analyzeTrainingHandler({
      dataset_id: datasetId,
      job_id: 'ft-job-001',
    }) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Error — missing dataset_id
  // ---------------------------------------------------------------------------

  it('returns error when dataset_id is missing', async () => {
    const result = await analyzeTrainingHandler({}) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toBe('dataset_id is required');
  });
});
