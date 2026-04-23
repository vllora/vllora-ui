/**
 * Eval Analysis Integration Tests
 *
 * Tests the analyze_evaluation tool handler with real IndexedDB data.
 * Seeds EvalJobs with evaluation results, then calls the handler
 * and asserts the analysis output (health, per_topic, next_action).
 *
 * No MSW needed — analyze_evaluation reads from IndexedDB only.
 */

import { describe, it, expect } from 'vitest';
import { analyzeEvaluationHandler } from '@/lib/distri-finetune-tools/steps/analyze-evaluation';
import { seedDataset, seedRecords, seedCompletedEvalJob, seedIterationHistory } from './seed-helpers';
import type { IterationHistoryEntry } from '@/types/iteration-types';

// =============================================================================
// Helpers
// =============================================================================

/** Seed a full eval scenario: dataset + records + EvalJob with scores. */
async function seedEvalScenario(opts: {
  scores: { rowId: string; score: number; topic: string }[];
}) {
  const workflowId = await seedDataset();

  // Seed records with topics — returns actual auto-generated IDs
  const actualIds = await seedRecords(
    workflowId,
    opts.scores.map((s) => ({ id: s.rowId, topic: s.topic })),
  );

  // Remap scores to use actual record IDs (not the user-provided rowId)
  const remappedScores = opts.scores.map((s, i) => ({
    ...s,
    rowId: actualIds[i],
  }));

  // Seed EvalJob with completed results using actual record IDs
  await seedCompletedEvalJob(workflowId, { scores: remappedScores });

  return workflowId;
}

// =============================================================================
// Tests
// =============================================================================

describe('analyze_evaluation integration', () => {
  // ---------------------------------------------------------------------------
  // Healthy scenario
  // ---------------------------------------------------------------------------

  it('returns healthy + train for good scores', async () => {
    // Scores designed to hit: mean ~0.50 (healthy_range: 0.25–0.65)
    // and std ~0.18 (good_variance: 0.10–0.25) → overall = 'healthy'
    const workflowId = await seedEvalScenario({
      scores: [
        { rowId: 'r0', score: 0.65, topic: 'Pins' },
        { rowId: 'r1', score: 0.55, topic: 'Forks' },
        { rowId: 'r2', score: 0.25, topic: 'Combos' },
        { rowId: 'r3', score: 0.60, topic: 'Pins' },
        { rowId: 'r4', score: 0.50, topic: 'Forks' },
        { rowId: 'r5', score: 0.30, topic: 'Combos' },
      ],
    });

    const result = await analyzeEvaluationHandler({ workflow_id: workflowId }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const health = result.health as { overall: string; mean_score: number };
    expect(health.overall).toBe('healthy');
    expect(health.mean_score).toBeGreaterThan(0.25);
    expect(result.next_action).toBe('train');
  });

  // ---------------------------------------------------------------------------
  // Warning scenario — weak topics
  // ---------------------------------------------------------------------------

  it('returns warning + iterate for too-hard scores', async () => {
    // Scores designed to hit: mean ~0.20 (too_hard: < 0.25) → overall = 'warning'
    // hasFailingTopics = true → next_action = 'iterate'
    const workflowId = await seedEvalScenario({
      scores: [
        { rowId: 'r0', score: 0.35, topic: 'Pins' },
        { rowId: 'r1', score: 0.30, topic: 'Pins' },
        { rowId: 'r2', score: 0.10, topic: 'Combos' },
        { rowId: 'r3', score: 0.08, topic: 'Combos' },
        { rowId: 'r4', score: 0.20, topic: 'Forks' },
        { rowId: 'r5', score: 0.15, topic: 'Forks' },
      ],
    });

    const result = await analyzeEvaluationHandler({ workflow_id: workflowId }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const health = result.health as { overall: string; mean_verdict: string };
    expect(health.overall).toBe('warning');
    expect(health.mean_verdict).toBe('too_hard');
    expect(result.next_action).toBe('iterate');
  });

  // ---------------------------------------------------------------------------
  // Critical scenario — binary scoring
  // ---------------------------------------------------------------------------

  it('returns critical for binary grader scores', async () => {
    const workflowId = await seedEvalScenario({
      scores: [
        { rowId: 'r0', score: 0.0, topic: 'Pins' },
        { rowId: 'r1', score: 1.0, topic: 'Pins' },
        { rowId: 'r2', score: 0.0, topic: 'Forks' },
        { rowId: 'r3', score: 1.0, topic: 'Forks' },
        { rowId: 'r4', score: 0.0, topic: 'Pins' },
        { rowId: 'r5', score: 0.0, topic: 'Forks' },
        { rowId: 'r6', score: 0.0, topic: 'Pins' },
        { rowId: 'r7', score: 0.0, topic: 'Forks' },
        { rowId: 'r8', score: 1.0, topic: 'Pins' },
        { rowId: 'r9', score: 0.0, topic: 'Forks' },
      ],
    });

    const result = await analyzeEvaluationHandler({ workflow_id: workflowId }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const grader = result.grader_health as { binary_scoring: boolean; verdict: string };
    expect(grader.binary_scoring).toBe(true);
    expect(grader.verdict).not.toBe('healthy');
  });

  // ---------------------------------------------------------------------------
  // Stalled scenario — flat across iterations
  // ---------------------------------------------------------------------------

  it('returns escalate when stalled across iterations', async () => {
    // Scores designed to hit: mean ~0.45 (healthy_range), std ~0.15 (good_variance)
    // No failing topics → overall = 'healthy' → allows stall escalation check
    // Current mean matches history (all ~0.45) → trend = 'stalled'
    const workflowId = await seedEvalScenario({
      scores: [
        { rowId: 'r0', score: 0.60, topic: 'Pins' },
        { rowId: 'r1', score: 0.30, topic: 'Forks' },
        { rowId: 'r2', score: 0.55, topic: 'Pins' },
        { rowId: 'r3', score: 0.35, topic: 'Forks' },
      ],
    });

    // Seed 3 stalled iterations with means close to current (~0.45)
    const history: IterationHistoryEntry[] = [
      { iteration: 1, timestamp: Date.now() - 10000, evalId: 'e1', dryRunScores: { mean: 0.44, perTopic: { Pins: 0.56, Forks: 0.32 } }, changesMade: 'Initial', decision: 'iterate' },
      { iteration: 2, timestamp: Date.now() - 5000, evalId: 'e2', dryRunScores: { mean: 0.45, perTopic: { Pins: 0.57, Forks: 0.33 } }, changesMade: 'Tweak', decision: 'iterate' },
      { iteration: 3, timestamp: Date.now() - 1000, evalId: 'e3', dryRunScores: { mean: 0.44, perTopic: { Pins: 0.56, Forks: 0.32 } }, changesMade: 'More', decision: 'iterate' },
    ];
    await seedIterationHistory(workflowId, history);

    const result = await analyzeEvaluationHandler({ workflow_id: workflowId }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const comparison = result.iteration_comparison as { stall_count: number; trend: string } | undefined;
    expect(comparison).toBeDefined();
    expect(comparison!.trend).toBe('stalled');
    expect(comparison!.stall_count).toBeGreaterThanOrEqual(2);
    expect(result.next_action).toBe('escalate');
  });

  // ---------------------------------------------------------------------------
  // Error — no evaluation found
  // ---------------------------------------------------------------------------

  it('returns error when no evaluation exists', async () => {
    const workflowId = await seedDataset();
    await seedRecords(workflowId, [{ topic: 'Pins' }]);

    const result = await analyzeEvaluationHandler({ workflow_id: workflowId }) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Per-topic breakdown
  // ---------------------------------------------------------------------------

  it('includes per-topic breakdown with classifications', async () => {
    const workflowId = await seedEvalScenario({
      scores: [
        { rowId: 'r0', score: 0.75, topic: 'Pins' },
        { rowId: 'r1', score: 0.70, topic: 'Pins' },
        { rowId: 'r2', score: 0.15, topic: 'Forks' },
        { rowId: 'r3', score: 0.10, topic: 'Forks' },
      ],
    });

    const result = await analyzeEvaluationHandler({ workflow_id: workflowId }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const topics = result.per_topic as Array<{ topic: string; classification: string }>;
    expect(topics.length).toBe(2);

    const pins = topics.find((t) => t.topic === 'Pins');
    const forks = topics.find((t) => t.topic === 'Forks');
    expect(pins).toBeDefined();
    expect(forks).toBeDefined();
    expect(pins!.classification).toBe('strong');
    expect(forks!.classification).toBe('failing');
  });

  // ---------------------------------------------------------------------------
  // Recommendations
  // ---------------------------------------------------------------------------

  it('generates recommendations for failing topics', async () => {
    const workflowId = await seedEvalScenario({
      scores: [
        { rowId: 'r0', score: 0.10, topic: 'Combos' },
        { rowId: 'r1', score: 0.12, topic: 'Combos' },
        { rowId: 'r2', score: 0.08, topic: 'Combos' },
        { rowId: 'r3', score: 0.55, topic: 'Pins' },
        { rowId: 'r4', score: 0.60, topic: 'Pins' },
      ],
    });

    const result = await analyzeEvaluationHandler({ workflow_id: workflowId }) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const recs = result.recommendations as Array<{ action: string; priority: string }>;
    expect(recs.length).toBeGreaterThan(0);
    // Should have a high-priority recommendation about failing topics
    const highPriority = recs.filter((r) => r.priority === 'high');
    expect(highPriority.length).toBeGreaterThan(0);
  });
});
