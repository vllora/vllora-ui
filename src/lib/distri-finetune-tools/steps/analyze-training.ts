/**
 * Analyze Training Tool
 *
 * Codifies the RFT decision tree Section 5 (Outer Loop) as a deterministic
 * analysis tool. Fetches per-epoch finetune evaluation scores, groups by topic,
 * detects training patterns (overfitting, no-learning, reward hacking), and
 * recommends next steps.
 *
 * Phase 3A of "Give Lucy Wisdom" — enables the outer loop.
 */

import type { DistriFnTool } from '@distri/core';
import type {
  ToolHandler,
  AnalyzeTrainingResult,
  EvalBaseline,
  TrainingPattern,
  TrainingNextAction,
  TopicEpochProgression,
} from '../types';
import {
  getAllFinetuneEvaluations,
  getFinetuneJobStatus,
  getFinetuneJobMetrics,
  getEvaluatorVersions,
  listFinetuneJobs,
} from '@/services/finetune-api';
import type { FinetuneJob, RowEpochResults, EpochEvalResult } from '@/services/finetune-api';
import { datasetService, recordService, iterationStateService, workflowService } from '@/services/service-registry';

// =============================================================================
// Constants (from rft-decision-tree.md Section 5)
// =============================================================================

const EPOCH_IMPROVEMENT_THRESHOLD = 0.03;
const OVERFITTING_DROP_THRESHOLD = 0.05;
const REWARD_HACKING_CEILING = 0.95;
const MIN_EPOCHS_FOR_ANALYSIS = 2;

// =============================================================================
// Internal Types
// =============================================================================

type Priority = 'high' | 'medium' | 'low';

interface Recommendation {
  priority: Priority;
  action: string;
  rationale: string;
  target_topics?: string[];
}

interface ResolvedJob {
  readonly job: FinetuneJob;
  readonly workflowId: string;
}

interface OverallProgression {
  readonly first_epoch_mean: number;
  readonly last_epoch_mean: number;
  readonly delta: number;
  readonly peak_epoch: number;
  readonly peak_mean: number;
}

// =============================================================================
// Job Resolution
// =============================================================================

async function resolveTrainingJob(
  workflowId: string,
  jobId?: string,
): Promise<ResolvedJob> {
  // Verify the dataset exists
  const dataset = await datasetService.getById(workflowId);
  if (!dataset) {
    throw new Error('Dataset not found — cannot fetch training results');
  }

  // If explicit jobId provided, fetch it directly
  if (jobId) {
    const job = await getFinetuneJobStatus(workflowId, jobId);
    return { job, workflowId };
  }

  // Otherwise, find job from workflow
  const workflow = await workflowService.getByDataset(workflowId);
  if (workflow?.training?.jobId) {
    const job = await getFinetuneJobStatus(workflowId, workflow.training.jobId);
    return { job, workflowId };
  }

  // Fallback: list jobs for this dataset, pick most recent completed
  // The dataset ID is the backend dataset ID — they are always the same.
  const jobs = await listFinetuneJobs(workflowId);
  const completed = jobs
    .filter((j) => j.status === 'succeeded' || j.status === 'failed')
    .sort((a, b) => (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at));

  if (completed.length === 0) {
    throw new Error('No completed training job found for this dataset');
  }

  return { job: completed[0], workflowId };
}

// =============================================================================
// Topic Mapping
// =============================================================================

async function buildTopicMap(workflowId: string): Promise<Map<string, string>> {
  const records = await recordService.getByDatasetId(workflowId);
  const topicMap = new Map<string, string>();
  for (const record of records) {
    topicMap.set(record.id, record.topic ?? 'uncategorized');
  }
  return topicMap;
}

// =============================================================================
// Epoch Score Computation
// =============================================================================

function computeEpochMean(entries: EpochEvalResult[]): number | null {
  const scores = entries
    .map((e) => e.score)
    .filter((s): s is number => s != null && !isNaN(s));
  if (scores.length === 0) return null;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

function getEpochNumbers(results: RowEpochResults[]): number[] {
  const epochSet = new Set<number>();
  for (const row of results) {
    for (const epochKey of Object.keys(row.epochs)) {
      epochSet.add(Number(epochKey));
    }
  }
  return [...epochSet].sort((a, b) => a - b);
}

function computeTopicProgressions(
  results: RowEpochResults[],
  topicMap: Map<string, string>,
  epochs: number[],
): TopicEpochProgression[] {
  // Group rows by topic
  const topicRows = new Map<string, RowEpochResults[]>();
  for (const row of results) {
    const topic = topicMap.get(row.row?.id ?? '') ?? 'uncategorized';
    const existing = topicRows.get(topic) ?? [];
    topicRows.set(topic, [...existing, row]);
  }

  // Compute per-topic, per-epoch means
  const progressions: TopicEpochProgression[] = [];

  for (const [topic, rows] of topicRows) {
    const epochScores: Record<number, number> = {};
    let peakEpoch = epochs[0];
    let peakScore = -Infinity;

    for (const epoch of epochs) {
      const allEntries = rows.flatMap((r) => r.epochs[epoch] ?? []);
      const mean = computeEpochMean(allEntries);
      if (mean != null) {
        epochScores[epoch] = mean;
        if (mean > peakScore) {
          peakScore = mean;
          peakEpoch = epoch;
        }
      }
    }

    const scoredEpochs = Object.keys(epochScores).map(Number).sort((a, b) => a - b);
    if (scoredEpochs.length === 0) continue;

    const firstScore = epochScores[scoredEpochs[0]];
    const lastScore = epochScores[scoredEpochs[scoredEpochs.length - 1]];
    const pattern = classifyTopicPattern(firstScore, lastScore, peakScore, peakEpoch, scoredEpochs, epochScores);

    progressions.push({
      topic,
      record_count: rows.length,
      epoch_scores: epochScores,
      first_epoch_score: firstScore,
      last_epoch_score: lastScore,
      peak_epoch: peakEpoch,
      peak_score: peakScore,
      pattern,
    });
  }

  return progressions;
}

// =============================================================================
// Pattern Classification
// =============================================================================

function classifyTopicPattern(
  firstScore: number,
  lastScore: number,
  peakScore: number,
  peakEpoch: number,
  scoredEpochs: number[],
  epochScores: Record<number, number>,
): TrainingPattern | 'mixed' {
  const lastEpoch = scoredEpochs[scoredEpochs.length - 1];
  const delta = lastScore - firstScore;

  // Check for reward hacking: last epoch suspiciously high
  if (lastScore > REWARD_HACKING_CEILING && delta > EPOCH_IMPROVEMENT_THRESHOLD) {
    return 'reward_hacking';
  }

  // Check for overfitting: peak is not the last epoch, and drop is significant
  if (peakEpoch !== lastEpoch && peakScore - lastScore > OVERFITTING_DROP_THRESHOLD) {
    return 'overfitting';
  }

  // Check for no learning: negligible change from first to last
  if (Math.abs(delta) < EPOCH_IMPROVEMENT_THRESHOLD) {
    return 'no_learning';
  }

  // Check for consistent improvement: each epoch >= previous (with tolerance)
  let isImproving = true;
  for (let i = 1; i < scoredEpochs.length; i++) {
    const prev = epochScores[scoredEpochs[i - 1]];
    const curr = epochScores[scoredEpochs[i]];
    if (curr < prev - EPOCH_IMPROVEMENT_THRESHOLD) {
      isImproving = false;
      break;
    }
  }

  if (isImproving && delta > EPOCH_IMPROVEMENT_THRESHOLD) {
    return 'all_improving';
  }

  return 'mixed';
}

// =============================================================================
// Overall Progression
// =============================================================================

function computeOverallProgression(
  progressions: TopicEpochProgression[],
  epochs: number[],
): OverallProgression {
  const epochMeans: Record<number, number> = {};
  let peakEpoch = epochs[0];
  let peakMean = -Infinity;

  for (const epoch of epochs) {
    const scores = progressions
      .map((p) => p.epoch_scores[epoch])
      .filter((s): s is number => s != null);
    if (scores.length === 0) continue;
    const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    epochMeans[epoch] = mean;
    if (mean > peakMean) {
      peakMean = mean;
      peakEpoch = epoch;
    }
  }

  const scoredEpochs = Object.keys(epochMeans).map(Number).sort((a, b) => a - b);
  const first = epochMeans[scoredEpochs[0]] ?? 0;
  const last = epochMeans[scoredEpochs[scoredEpochs.length - 1]] ?? 0;

  return {
    first_epoch_mean: first,
    last_epoch_mean: last,
    delta: last - first,
    peak_epoch: peakEpoch,
    peak_mean: peakMean,
  };
}

// =============================================================================
// Pattern Detection (aggregate)
// =============================================================================

function detectPatterns(
  progressions: TopicEpochProgression[],
  jobStatus: string,
): TrainingPattern[] {
  const patterns = new Set<TrainingPattern>();

  if (jobStatus === 'failed') {
    patterns.add('training_failure');
    return [...patterns];
  }

  for (const p of progressions) {
    if (p.pattern !== 'mixed') {
      patterns.add(p.pattern);
    }
  }

  // If all topics are improving, add the aggregate pattern
  if (progressions.length > 0 && progressions.every((p) => p.pattern === 'all_improving')) {
    patterns.add('all_improving');
  }

  return [...patterns];
}

// =============================================================================
// Recommendation Generator
// =============================================================================

function generateTrainingRecommendations(
  patterns: TrainingPattern[],
  progressions: TopicEpochProgression[],
  jobStatus: string,
): Recommendation[] {
  const recs: Recommendation[] = [];

  if (patterns.includes('training_failure')) {
    recs.push({
      priority: 'high',
      action: 'Training failed — check error message and fix data format or reduce dataset size',
      rationale: `Job status: ${jobStatus}`,
    });
    return recs;
  }

  // Overfitting recommendations
  const overfittingTopics = progressions.filter((p) => p.pattern === 'overfitting');
  if (overfittingTopics.length > 0) {
    recs.push({
      priority: 'high',
      action: `Overfitting detected in ${overfittingTopics.length} topic(s) — use earlier epoch checkpoint or reduce epochs`,
      target_topics: overfittingTopics.map((t) => t.topic),
      rationale: overfittingTopics
        .map((t) => `${t.topic}: peak ${t.peak_score.toFixed(3)} at epoch ${t.peak_epoch}, dropped to ${t.last_epoch_score.toFixed(3)}`)
        .join('; '),
    });
  }

  // Reward hacking recommendations
  const hackingTopics = progressions.filter((p) => p.pattern === 'reward_hacking');
  if (hackingTopics.length > 0) {
    recs.push({
      priority: 'high',
      action: 'Possible reward hacking — add discriminative criteria to grader',
      target_topics: hackingTopics.map((t) => t.topic),
      rationale: hackingTopics
        .map((t) => `${t.topic}: last epoch score ${t.last_epoch_score.toFixed(3)} > ${REWARD_HACKING_CEILING}`)
        .join('; '),
    });
  }

  // No learning recommendations
  const noLearningTopics = progressions.filter((p) => p.pattern === 'no_learning');
  if (noLearningTopics.length > 0) {
    recs.push({
      priority: 'medium',
      action: `No learning in ${noLearningTopics.length} topic(s) — check record count, variety, and grader alignment`,
      target_topics: noLearningTopics.map((t) => t.topic),
      rationale: noLearningTopics
        .map((t) => `${t.topic}: first=${t.first_epoch_score.toFixed(3)}, last=${t.last_epoch_score.toFixed(3)}, delta=${(t.last_epoch_score - t.first_epoch_score).toFixed(3)}`)
        .join('; '),
    });
  }

  // All improving — positive recommendation
  if (patterns.includes('all_improving') && overfittingTopics.length === 0 && hackingTopics.length === 0) {
    recs.push({
      priority: 'low',
      action: 'All topics improving — run a post-training evaluation to confirm quality before deploying',
      rationale: 'Training scores increased consistently across epochs',
    });
  }

  // Sort by priority
  const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  return [...recs].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

// =============================================================================
// Next Action Decision
// =============================================================================

function decideTrainingNextAction(
  patterns: TrainingPattern[],
  jobStatus: string,
): TrainingNextAction {
  if (jobStatus === 'failed' || patterns.includes('training_failure')) {
    return 'retrain';
  }

  if (patterns.includes('reward_hacking')) {
    return 'investigate';
  }

  if (patterns.includes('overfitting')) {
    return 'investigate';
  }

  if (patterns.includes('no_learning')) {
    // Some topics didn't learn — go back to inner loop for those topics
    return 'inner_loop';
  }

  if (patterns.includes('all_improving')) {
    return 'deploy_eval';
  }

  // Mixed patterns — investigate
  return 'investigate';
}

// =============================================================================
// Eval Baseline Lookup
// =============================================================================

/** Pull pre-training eval baseline from the last iteration history entry. */
async function lookupEvalBaseline(workflowId: string): Promise<EvalBaseline | undefined> {
  const state = await iterationStateService.getOrCreate(workflowId);
  if (state.history.length === 0) return undefined;

  // Last iteration entry = the eval that preceded training
  const lastEntry = state.history[state.history.length - 1];
  if (!lastEntry.dryRunScores) return undefined;

  return {
    iteration_count: state.history.length,
    final_eval_mean: lastEntry.dryRunScores.mean,
    per_topic_scores: lastEntry.dryRunScores.perTopic,
  };
}

// =============================================================================
// Iteration State Update
// =============================================================================

async function updateOuterLoopState(
  workflowId: string,
  jobId: string,
  progressions: TopicEpochProgression[],
): Promise<void> {
  const state = await iterationStateService.getOrCreate(workflowId);

  // Build epoch scores map: topic → scores array
  const epochScores: Record<string, number[]> = {};
  for (const p of progressions) {
    const sortedEpochs = Object.keys(p.epoch_scores).map(Number).sort((a, b) => a - b);
    epochScores[p.topic] = sortedEpochs.map((e) => p.epoch_scores[e]);
  }

  await iterationStateService.save({
    ...state,
    phase: 'post_training',
    outerLoop: {
      ...state.outerLoop,
      lastTrainingJobId: jobId,
      lastEpochScores: epochScores,
    },
  });
}

// =============================================================================
// Main Handler
// =============================================================================

export const analyzeTrainingHandler: ToolHandler = async (params) => {
  try {
    const workflowId = params.workflow_id as string | undefined;
    const jobId = params.job_id as string | undefined;

    if (!workflowId) {
      return { success: false, error: 'workflow_id is required' } satisfies AnalyzeTrainingResult;
    }

    // 1. Resolve the training job
    const { job } = await resolveTrainingJob(workflowId, jobId);

    // Handle failed jobs early
    if (job.status === 'failed') {
      return {
        success: true,
        job_id: job.id,
        job_status: job.status,
        patterns_detected: ['training_failure'],
        recommendations: [{
          priority: 'high',
          action: `Training failed: ${job.error_message ?? 'Unknown error'}`,
          rationale: 'Fix the issue and retrain',
        }],
        next_action: 'retrain',
      } satisfies AnalyzeTrainingResult;
    }

    // 2. Fetch per-epoch evaluation results
    const evalResponse = await getAllFinetuneEvaluations(workflowId, job.provider_job_id);
    const results = evalResponse.results;

    if (results.length === 0) {
      return {
        success: true,
        job_id: job.id,
        job_status: job.status,
        total_rows: 0,
        recommendations: [{
          priority: 'medium',
          action: 'No evaluation results found — training may still be in progress or results not yet available',
          rationale: 'Wait for training to produce epoch evaluation data',
        }],
        next_action: 'investigate',
      } satisfies AnalyzeTrainingResult;
    }

    // 3. Get epoch numbers and validate
    const epochs = getEpochNumbers(results);

    // 4. Build topic map and compute progressions
    const topicMap = await buildTopicMap(workflowId);
    const progressions = computeTopicProgressions(results, topicMap, epochs);
    const overall = computeOverallProgression(progressions, epochs);

    // 5. Detect patterns and generate recommendations
    const patterns = detectPatterns(progressions, job.status);
    const recommendations = generateTrainingRecommendations(patterns, progressions, job.status);
    const nextAction = decideTrainingNextAction(patterns, job.status);

    // 6. Update iteration state + look up eval baseline
    await updateOuterLoopState(workflowId, job.id, progressions);
    const evalBaseline = await lookupEvalBaseline(workflowId);

    // 6b. Fetch evaluator version + finetune metrics (non-critical, parallel)
    let evaluator_version: { version: number; created_at: string; has_diff: boolean } | undefined;
    let finetuneMetrics: { reward: number | null; kl: number | null; loss: number | null; clipped_ratio: number | null } | undefined;
    try {
      const dataset = await datasetService.getById(workflowId);
      const [evalVersions, metricsResp] = await Promise.all([
        dataset ? getEvaluatorVersions(dataset.id).catch(() => []) : Promise.resolve([]),
        getFinetuneJobMetrics(workflowId, job.provider_job_id).catch(() => ({ metrics: [] })),
      ]);
      if (evalVersions.length > 0) {
        const latest = evalVersions[0];
        evaluator_version = { version: latest.version, created_at: latest.created_at, has_diff: latest.diff != null };
      }
      const snapshots = metricsResp.metrics.map((m) => m.metrics);
      if (snapshots.length > 0) {
        const last = snapshots[snapshots.length - 1];
        finetuneMetrics = {
          reward: typeof last.reward === 'number' ? last.reward : null,
          kl: typeof last.kl === 'number' ? last.kl : null,
          loss: typeof last.loss === 'number' ? last.loss : null,
          clipped_ratio: typeof last['completions/clipped_ratio'] === 'number' ? last['completions/clipped_ratio'] : null,
        };
      }
    } catch {
      // Non-critical — proceed without enrichment
    }

    // 7. Note if insufficient epochs for full analysis
    if (epochs.length < MIN_EPOCHS_FOR_ANALYSIS) {
      recommendations.unshift({
        priority: 'low',
        action: `Only ${epochs.length} epoch(s) — trend detection limited. Consider training with more epochs.`,
        rationale: `Need at least ${MIN_EPOCHS_FOR_ANALYSIS} epochs for reliable pattern detection`,
      });
    }

    return {
      success: true,
      job_id: job.id,
      job_status: job.status,
      total_epochs: epochs.length,
      total_rows: results.length,
      overall_progression: overall,
      per_topic: progressions,
      patterns_detected: patterns,
      recommendations,
      next_action: nextAction,
      eval_baseline: evalBaseline,
      evaluator_version,
      training_metrics: finetuneMetrics,
    } satisfies AnalyzeTrainingResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze training results',
    } satisfies AnalyzeTrainingResult;
  }
};

// =============================================================================
// Tool Definition
// =============================================================================

export const analyzeTrainingTool: DistriFnTool = {
  name: 'analyze_training',
  description:
    'Analyze training results after a finetune job completes. Fetches per-epoch evaluation data, computes per-topic score progression, detects patterns (overfitting, no learning, reward hacking), and recommends next steps (deploy, retrain, or return to inner loop). Call this after check_training_status shows status "completed".',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The dataset ID to analyze training results for',
      },
      job_id: {
        type: 'string',
        description: 'Specific training job ID. If omitted, uses the latest completed job from the workflow.',
      },
    },
    required: ['workflow_id'],
  },
  handler: async (input) =>
    JSON.stringify(await analyzeTrainingHandler(input as Record<string, unknown>)),
} as DistriFnTool;
