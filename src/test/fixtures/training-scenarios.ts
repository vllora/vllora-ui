/**
 * Training Scenario Fixtures
 *
 * Pre-built test data for different training outcomes.
 */

import type { AnalyzeTrainingResult, EvalBaseline, TrainingPattern } from '@/lib/distri-finetune-tools/types';

/** Pre-training eval baseline fixture for combined view tests */
export const EVAL_BASELINE_FIXTURE: EvalBaseline = {
  iteration_count: 3,
  final_eval_mean: 0.52,
  per_topic_scores: { Pins: 0.48, Forks: 0.55, Combos: 0.53 },
};

export const TRAINING_SCENARIOS = {
  /** All topics improving — ready for post-training eval */
  improving: {
    success: true,
    job_id: 'ft-job-001',
    job_status: 'succeeded',
    total_epochs: 3,
    total_rows: 150,
    overall_progression: {
      first_epoch_mean: 0.35,
      last_epoch_mean: 0.62,
      delta: 0.27,
      peak_epoch: 3,
      peak_mean: 0.62,
    },
    per_topic: [
      { topic: 'Pins', record_count: 50, epoch_scores: { 1: 0.38, 2: 0.55, 3: 0.68 }, first_epoch_score: 0.38, last_epoch_score: 0.68, peak_epoch: 3, peak_score: 0.68, pattern: 'all_improving' as TrainingPattern },
      { topic: 'Forks', record_count: 50, epoch_scores: { 1: 0.32, 2: 0.48, 3: 0.58 }, first_epoch_score: 0.32, last_epoch_score: 0.58, peak_epoch: 3, peak_score: 0.58, pattern: 'all_improving' as TrainingPattern },
      { topic: 'Combos', record_count: 50, epoch_scores: { 1: 0.35, 2: 0.50, 3: 0.60 }, first_epoch_score: 0.35, last_epoch_score: 0.60, peak_epoch: 3, peak_score: 0.60, pattern: 'all_improving' as TrainingPattern },
    ],
    patterns_detected: ['all_improving' as TrainingPattern],
    recommendations: [],
    next_action: 'deploy_eval' as const,
  } satisfies AnalyzeTrainingResult,

  /** Overfitting detected — scores peak then drop */
  overfitting: {
    success: true,
    job_id: 'ft-job-002',
    job_status: 'succeeded',
    total_epochs: 4,
    total_rows: 150,
    overall_progression: {
      first_epoch_mean: 0.40,
      last_epoch_mean: 0.38,
      delta: -0.02,
      peak_epoch: 2,
      peak_mean: 0.55,
    },
    per_topic: [
      { topic: 'Pins', record_count: 50, epoch_scores: { 1: 0.42, 2: 0.58, 3: 0.50, 4: 0.40 }, first_epoch_score: 0.42, last_epoch_score: 0.40, peak_epoch: 2, peak_score: 0.58, pattern: 'overfitting' as TrainingPattern },
      { topic: 'Forks', record_count: 50, epoch_scores: { 1: 0.38, 2: 0.52, 3: 0.45, 4: 0.36 }, first_epoch_score: 0.38, last_epoch_score: 0.36, peak_epoch: 2, peak_score: 0.52, pattern: 'overfitting' as TrainingPattern },
    ],
    patterns_detected: ['overfitting' as TrainingPattern],
    recommendations: [
      { priority: 'high' as const, action: 'Reduce to 2 epochs (peak performance)', rationale: 'Scores degrade after epoch 2' },
      { priority: 'medium' as const, action: 'Add more diverse training data', rationale: 'Model memorizing rather than generalizing' },
    ],
    next_action: 'retrain' as const,
  } satisfies AnalyzeTrainingResult,

  /** No learning — flat across epochs */
  noLearning: {
    success: true,
    job_id: 'ft-job-003',
    job_status: 'succeeded',
    total_epochs: 3,
    total_rows: 150,
    overall_progression: {
      first_epoch_mean: 0.30,
      last_epoch_mean: 0.31,
      delta: 0.01,
      peak_epoch: 2,
      peak_mean: 0.32,
    },
    per_topic: [
      { topic: 'Pins', record_count: 50, epoch_scores: { 1: 0.30, 2: 0.31, 3: 0.30 }, first_epoch_score: 0.30, last_epoch_score: 0.30, peak_epoch: 2, peak_score: 0.31, pattern: 'no_learning' as TrainingPattern },
    ],
    patterns_detected: ['no_learning' as TrainingPattern],
    recommendations: [
      { priority: 'high' as const, action: 'Revisit grader — may not provide clear training signal', rationale: 'No score improvement across 3 epochs' },
      { priority: 'high' as const, action: 'Check if task is learnable with current data', rationale: 'Model not learning from examples' },
    ],
    next_action: 'inner_loop' as const,
  } satisfies AnalyzeTrainingResult,

  /** Error — training failed */
  error: {
    success: false,
    error: 'Training job failed: insufficient credits',
  } satisfies AnalyzeTrainingResult,
} as const;
