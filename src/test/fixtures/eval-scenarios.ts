/**
 * Evaluation Scenario Fixtures
 *
 * Pre-built test data for different evaluation outcomes.
 * Used by tool handler tests, renderer tests, and integration tests.
 */

import type { AnalyzeEvaluationResult } from '@/lib/distri-finetune-tools/types';
import type { IterationHistoryEntry } from '@/types/iteration-types';

// =============================================================================
// Raw Evaluation Results (what the backend returns)
// =============================================================================

export interface MockEvalRecord {
  readonly dataset_row_id: string;
  readonly row_index: number;
  readonly score: number;
  readonly reason: string;
  readonly status: 'completed' | 'failed';
  readonly topic?: string;
}

/** Generate N mock eval records with configurable scores. */
export function makeEvalRecords(
  count: number,
  opts: { meanScore?: number; variance?: number; topic?: string } = {},
): readonly MockEvalRecord[] {
  const { meanScore = 0.5, variance = 0.15, topic } = opts;
  return Array.from({ length: count }, (_, i) => {
    const score = Math.max(0, Math.min(1, meanScore + (Math.random() - 0.5) * variance * 2));
    return {
      dataset_row_id: `row-${i}`,
      row_index: i,
      score: Math.round(score * 1000) / 1000,
      reason: score >= 0.5 ? 'Meets criteria' : 'Does not meet criteria',
      status: 'completed' as const,
      topic: topic ?? `topic-${i % 3}`,
    };
  });
}

// =============================================================================
// Analysis Result Scenarios
// =============================================================================

export const EVAL_SCENARIOS = {
  /** Healthy eval — good scores, ready to train */
  healthy: {
    success: true,
    health: {
      overall: 'healthy' as const,
      mean_score: 0.65,
      std_score: 0.18,
      mean_verdict: 'healthy_range' as const,
      std_verdict: 'good_variance' as const,
      percent_above_zero: 0.92,
      percent_perfect: 0.15,
    },
    per_topic: [
      { topic: 'Pins', record_count: 50, avg_score: 0.72, classification: 'strong' as const },
      { topic: 'Forks', record_count: 50, avg_score: 0.61, classification: 'moderate' as const },
      { topic: 'Combos', record_count: 50, avg_score: 0.58, classification: 'moderate' as const },
    ],
    grader_health: { binary_scoring: false, low_variance: false, verdict: 'healthy' as const },
    recommendations: [],
    next_action: 'train' as const,
  } satisfies AnalyzeEvaluationResult,

  /** Warning — some weak topics */
  warning: {
    success: true,
    health: {
      overall: 'warning' as const,
      mean_score: 0.42,
      std_score: 0.25,
      mean_verdict: 'too_hard' as const,
      std_verdict: 'good_variance' as const,
      percent_above_zero: 0.75,
      percent_perfect: 0.05,
    },
    per_topic: [
      { topic: 'Pins', record_count: 50, avg_score: 0.65, classification: 'moderate' as const },
      { topic: 'Forks', record_count: 50, avg_score: 0.35, classification: 'weak' as const },
      { topic: 'Combos', record_count: 50, avg_score: 0.22, classification: 'failing' as const, recommendation: 'Regenerate with simpler prompts' },
    ],
    grader_health: { binary_scoring: false, low_variance: false, verdict: 'healthy' as const },
    recommendations: [
      { priority: 'high' as const, lever: 'records' as const, action: 'Regenerate Combos data with simpler prompts', rationale: 'Topic scoring < 0.3' },
      { priority: 'medium' as const, lever: 'topics' as const, action: 'Consider narrowing Combos scope', rationale: 'High variance in topic' },
    ],
    next_action: 'iterate' as const,
  } satisfies AnalyzeEvaluationResult,

  /** Critical — grader issues, binary scoring */
  critical: {
    success: true,
    health: {
      overall: 'critical' as const,
      mean_score: 0.18,
      std_score: 0.38,
      mean_verdict: 'hard_stop' as const,
      std_verdict: 'bimodal' as const,
      percent_above_zero: 0.40,
      percent_perfect: 0.20,
    },
    per_topic: [
      { topic: 'Pins', record_count: 50, avg_score: 0.15, classification: 'failing' as const },
      { topic: 'Forks', record_count: 50, avg_score: 0.20, classification: 'failing' as const },
    ],
    grader_health: { binary_scoring: true, low_variance: false, verdict: 'problematic' as const },
    escalation: { level: 4 as const, description: 'Grader produces binary scores only', reason: 'Add partial credit criteria' },
    recommendations: [
      { priority: 'high' as const, lever: 'grader' as const, action: 'Add partial credit to grader criteria', rationale: '80%+ scores are 0 or 1' },
    ],
    next_action: 'escalate' as const,
  } satisfies AnalyzeEvaluationResult,

  /** Stalled — no improvement across iterations */
  stalled: {
    success: true,
    health: {
      overall: 'warning' as const,
      mean_score: 0.45,
      std_score: 0.20,
      mean_verdict: 'healthy_range' as const,
      std_verdict: 'good_variance' as const,
      percent_above_zero: 0.82,
      percent_perfect: 0.08,
    },
    per_topic: [
      { topic: 'Pins', record_count: 50, avg_score: 0.48, classification: 'moderate' as const },
      { topic: 'Forks', record_count: 50, avg_score: 0.42, classification: 'weak' as const },
    ],
    iteration_comparison: {
      iteration_number: 3,
      previous_mean: 0.44,
      current_mean: 0.45,
      delta: 0.01,
      trend: 'stalled' as const,
      per_topic_deltas: [
        { topic: 'Pins', previous: 0.47, current: 0.48, delta: 0.01, trend: 'stalled' as const },
        { topic: 'Forks', previous: 0.41, current: 0.42, delta: 0.01, trend: 'stalled' as const },
      ],
      stall_count: 3,
    },
    escalation: { level: 3 as const, description: 'Scores flat for 3 iterations', reason: 'Change approach' },
    recommendations: [
      { priority: 'high' as const, lever: 'grader' as const, action: 'Revise grader criteria', rationale: 'Scores stalled 3 iterations' },
      { priority: 'medium' as const, lever: 'records' as const, action: 'Regenerate with different prompts', rationale: 'Current prompts exhausted' },
    ],
    next_action: 'escalate' as const,
  } satisfies AnalyzeEvaluationResult,

  /** Error — analysis failed */
  error: {
    success: false,
    error: 'Evaluation run not found',
  } satisfies AnalyzeEvaluationResult,
} as const;

// =============================================================================
// Iteration History Fixtures
// =============================================================================

export const ITERATION_HISTORIES = {
  /** No history — fresh dataset */
  empty: [] as readonly IterationHistoryEntry[],

  /** Single iteration — no comparison possible */
  single: [
    { iteration: 1, timestamp: Date.now() - 3600000, evalId: 'eval-1', dryRunScores: { mean: 0.45, perTopic: { Pins: 0.5, Forks: 0.4 } }, changesMade: 'Initial eval', decision: 'iterate' as const },
  ] as readonly IterationHistoryEntry[],

  /** Improving — each iteration better */
  improving: [
    { iteration: 1, timestamp: Date.now() - 7200000, evalId: 'eval-1', dryRunScores: { mean: 0.35, perTopic: { Pins: 0.4, Forks: 0.3 } }, changesMade: 'Initial eval', decision: 'iterate' as const },
    { iteration: 2, timestamp: Date.now() - 3600000, evalId: 'eval-2', dryRunScores: { mean: 0.50, perTopic: { Pins: 0.55, Forks: 0.45 } }, changesMade: 'Regenerated weak topics', decision: 'iterate' as const },
    { iteration: 3, timestamp: Date.now(), evalId: 'eval-3', dryRunScores: { mean: 0.65, perTopic: { Pins: 0.70, Forks: 0.60 } }, changesMade: 'Adjusted grader', decision: 'train' as const },
  ] as readonly IterationHistoryEntry[],

  /** Stalled — 3 consecutive flat iterations */
  stalledThree: [
    { iteration: 1, timestamp: Date.now() - 7200000, evalId: 'eval-1', dryRunScores: { mean: 0.50, perTopic: { Pins: 0.5 } }, changesMade: 'Initial', decision: 'iterate' as const },
    { iteration: 2, timestamp: Date.now() - 5400000, evalId: 'eval-2', dryRunScores: { mean: 0.44, perTopic: { Pins: 0.44 } }, changesMade: 'Regen', decision: 'iterate' as const },
    { iteration: 3, timestamp: Date.now() - 3600000, evalId: 'eval-3', dryRunScores: { mean: 0.45, perTopic: { Pins: 0.45 } }, changesMade: 'Tweak', decision: 'iterate' as const },
    { iteration: 4, timestamp: Date.now(), evalId: 'eval-4', dryRunScores: { mean: 0.44, perTopic: { Pins: 0.44 } }, changesMade: 'More tweak', decision: 'escalate' as const },
  ] as readonly IterationHistoryEntry[],

  /** Stalled — 5 consecutive (severe) */
  stalledFive: [
    { iteration: 1, timestamp: Date.now() - 10000000, evalId: 'eval-1', dryRunScores: { mean: 0.60, perTopic: {} }, changesMade: 'Initial', decision: 'iterate' as const },
    { iteration: 2, timestamp: Date.now() - 8000000, evalId: 'eval-2', dryRunScores: { mean: 0.44, perTopic: {} }, changesMade: 'Regen', decision: 'iterate' as const },
    { iteration: 3, timestamp: Date.now() - 6000000, evalId: 'eval-3', dryRunScores: { mean: 0.45, perTopic: {} }, changesMade: 'Tweak', decision: 'iterate' as const },
    { iteration: 4, timestamp: Date.now() - 4000000, evalId: 'eval-4', dryRunScores: { mean: 0.44, perTopic: {} }, changesMade: 'More', decision: 'iterate' as const },
    { iteration: 5, timestamp: Date.now() - 2000000, evalId: 'eval-5', dryRunScores: { mean: 0.45, perTopic: {} }, changesMade: 'Yet more', decision: 'iterate' as const },
    { iteration: 6, timestamp: Date.now(), evalId: 'eval-6', dryRunScores: { mean: 0.44, perTopic: {} }, changesMade: 'Again', decision: 'escalate' as const },
  ] as readonly IterationHistoryEntry[],

  /** Mixed — improvement then stall */
  mixedThenStalled: [
    { iteration: 1, timestamp: Date.now() - 7200000, evalId: 'eval-1', dryRunScores: { mean: 0.30, perTopic: {} }, changesMade: 'Initial', decision: 'iterate' as const },
    { iteration: 2, timestamp: Date.now() - 5400000, evalId: 'eval-2', dryRunScores: { mean: 0.50, perTopic: {} }, changesMade: 'Big improvement', decision: 'iterate' as const },
    { iteration: 3, timestamp: Date.now() - 3600000, evalId: 'eval-3', dryRunScores: { mean: 0.51, perTopic: {} }, changesMade: 'Small tweak', decision: 'iterate' as const },
    { iteration: 4, timestamp: Date.now(), evalId: 'eval-4', dryRunScores: { mean: 0.50, perTopic: {} }, changesMade: 'Another try', decision: 'iterate' as const },
  ] as readonly IterationHistoryEntry[],
} as const;
