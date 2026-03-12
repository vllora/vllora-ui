/**
 * Analyze Evaluation Tool
 *
 * Codifies the RFT decision tree (docs/enhance-lucy/rft-decision-tree.md) as a
 * deterministic analysis tool. Fetches eval details + iteration history internally,
 * then classifies score health, detects stalls, and generates lever recommendations.
 *
 * Phase 2A of "Give Lucy Autonomy" — enables the inner loop iteration.
 */

import type { DistriFnTool } from '@distri/core';
import type { ToolHandler } from '../types';
import { getEvaluationDetailsHandler } from './get-evaluation-details';
import { getIterationHistoryHandler, logIterationHandler } from './iteration-history';
import { getEvaluatorVersions } from '@/services/finetune-api';
import { datasetService, workflowService } from '@/services/service-registry';

// =============================================================================
// Constants (from rft-decision-tree.md Section 2)
// =============================================================================

const SCORE_RANGES = {
  HARD_STOP: 0.10,
  WARNING_LOW: 0.25,
  HEALTHY_HIGH: 0.65,
  WARNING_HIGH: 0.85,
} as const;

const STD_RANGES = {
  NO_DIFFERENTIATION: 0.10,
  BIMODAL: 0.25,
} as const;

const STALL_THRESHOLD = 0.03;
const STALL_ITERATIONS_NEEDED = 2;
const BINARY_SCORE_THRESHOLD = 0.80; // >80% scores are 0 or 1
const MIN_RECORDS_PER_TOPIC = 20;
const ALL_TOPICS_SIMILAR_THRESHOLD = 0.10;

// =============================================================================
// Types
// =============================================================================

type MeanVerdict =
  | 'hard_stop'
  | 'too_hard'
  | 'healthy_range'
  | 'getting_easy'
  | 'too_easy';

type StdVerdict =
  | 'no_differentiation'
  | 'good_variance'
  | 'bimodal';

type OverallHealth = 'healthy' | 'warning' | 'critical';

type TopicClassification =
  | 'failing'
  | 'weak'
  | 'moderate'
  | 'strong'
  | 'over_performing';

type GraderVerdict = 'healthy' | 'needs_attention' | 'problematic';

type Trend = 'improving' | 'stalled' | 'regressing';

type NextAction = 'iterate' | 'train' | 'escalate' | 'hard_stop';

type Lever = 'grader' | 'records' | 'distribution' | 'training_config' | 'topics';

type Priority = 'high' | 'medium' | 'low';

interface HealthAssessment {
  overall: OverallHealth;
  mean_score: number;
  std_score: number;
  mean_verdict: MeanVerdict;
  std_verdict: StdVerdict;
  percent_above_zero: number;
  percent_perfect: number;
}

interface TopicAnalysis {
  topic: string;
  record_count: number;
  avg_score: number;
  classification: TopicClassification;
  recommendation?: string;
}

interface GraderHealth {
  binary_scoring: boolean;
  low_variance: boolean;
  verdict: GraderVerdict;
}

interface TopicDelta {
  topic: string;
  previous: number;
  current: number;
  delta: number;
  trend: Trend;
}

interface IterationComparison {
  iteration_number: number;
  previous_mean: number;
  current_mean: number;
  delta: number;
  trend: Trend;
  per_topic_deltas: TopicDelta[];
  stall_count: number;
}

interface Escalation {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  description: string;
  reason: string;
}

interface Recommendation {
  priority: Priority;
  lever: Lever;
  action: string;
  target_topics?: string[];
  rationale: string;
}

// =============================================================================
// Score Classification (Decision Tree Steps A + B)
// =============================================================================

function classifyMean(mean: number): MeanVerdict {
  if (mean < SCORE_RANGES.HARD_STOP) return 'hard_stop';
  if (mean < SCORE_RANGES.WARNING_LOW) return 'too_hard';
  if (mean <= SCORE_RANGES.HEALTHY_HIGH) return 'healthy_range';
  if (mean <= SCORE_RANGES.WARNING_HIGH) return 'getting_easy';
  return 'too_easy';
}

function classifyStd(std: number): StdVerdict {
  if (std < STD_RANGES.NO_DIFFERENTIATION) return 'no_differentiation';
  if (std <= STD_RANGES.BIMODAL) return 'good_variance';
  return 'bimodal';
}

function classifyOverallHealth(meanVerdict: MeanVerdict, stdVerdict: StdVerdict): OverallHealth {
  if (meanVerdict === 'hard_stop' || meanVerdict === 'too_easy') return 'critical';
  if (meanVerdict === 'too_hard' || meanVerdict === 'getting_easy') return 'warning';
  if (stdVerdict === 'no_differentiation') return 'warning';
  if (stdVerdict === 'bimodal') return 'warning';
  return 'healthy';
}

function assessHealth(summary: {
  mean_score: number;
  std_score: number;
  pass_rate: number;
  scored_records: number;
  min_score: number | null;
  max_score: number | null;
}): HealthAssessment {
  const meanVerdict = classifyMean(summary.mean_score);
  const stdVerdict = classifyStd(summary.std_score);

  return {
    overall: classifyOverallHealth(meanVerdict, stdVerdict),
    mean_score: summary.mean_score,
    std_score: summary.std_score,
    mean_verdict: meanVerdict,
    std_verdict: stdVerdict,
    percent_above_zero: summary.pass_rate,
    percent_perfect: 0, // Computed from worst_records if available
  };
}

// =============================================================================
// Per-Topic Analysis (Decision Tree Step C)
// =============================================================================

function classifyTopic(avgScore: number): TopicClassification {
  if (avgScore < 0.20) return 'failing';
  if (avgScore < 0.50) return 'weak';
  if (avgScore < 0.70) return 'moderate';
  if (avgScore < 0.85) return 'strong';
  return 'over_performing';
}

function analyzeTopics(
  perTopic: Array<{ topic: string; record_count: number; avg_score: number; min_score: number; max_score: number }>
): TopicAnalysis[] {
  return perTopic.map((t) => {
    const classification = classifyTopic(t.avg_score);
    let recommendation: string | undefined;

    if (classification === 'failing' && t.record_count < MIN_RECORDS_PER_TOPIC) {
      recommendation = `Add ${MIN_RECORDS_PER_TOPIC - t.record_count}+ records and simplify prompts`;
    } else if (classification === 'failing') {
      recommendation = 'Check grader reasons — prompts may be off-topic or too complex';
    } else if (classification === 'weak') {
      recommendation = 'Read grader reasons for failed records, apply targeted fix (lever 1 or 2)';
    } else if (classification === 'over_performing') {
      recommendation = 'Consider tightening grader for this topic — score may be inflated';
    }

    return {
      topic: t.topic,
      record_count: t.record_count,
      avg_score: t.avg_score,
      classification,
      recommendation,
    };
  });
}

// =============================================================================
// Grader Health (Decision Tree Step D)
// =============================================================================

function assessGraderHealth(
  worstRecords: Array<{ score: number }>,
  summary: { std_score: number; scored_records: number },
): GraderHealth {
  // Detect binary scoring: >80% of scores are 0 or 1
  const totalScored = summary.scored_records;
  const binaryCount = worstRecords.filter(
    (r) => r.score === 0 || r.score === 1
  ).length;
  const binaryScoring = totalScored > 0 && binaryCount / totalScored > BINARY_SCORE_THRESHOLD;

  const lowVariance = summary.std_score < STD_RANGES.NO_DIFFERENTIATION;

  let verdict: GraderVerdict = 'healthy';
  if (binaryScoring && lowVariance) {
    verdict = 'problematic';
  } else if (binaryScoring || lowVariance) {
    verdict = 'needs_attention';
  }

  return { binary_scoring: binaryScoring, low_variance: lowVariance, verdict };
}

// =============================================================================
// Cross-Iteration Comparison (Decision Tree Step E)
// =============================================================================

function computeIterationComparison(
  history: Array<{
    iteration: number;
    mean_score: number;
    per_topic_scores: Record<string, number>;
  }>,
  currentMean: number,
  currentPerTopic: Array<{ topic: string; avg_score: number }>,
): IterationComparison | null {
  if (history.length === 0) return null;

  const latest = history[history.length - 1];
  const delta = currentMean - latest.mean_score;

  let trend: Trend;
  if (delta > STALL_THRESHOLD) {
    trend = 'improving';
  } else if (delta < -STALL_THRESHOLD) {
    trend = 'regressing';
  } else {
    trend = 'stalled';
  }

  // Per-topic deltas
  const topicDeltas: TopicDelta[] = currentPerTopic.map((ct) => {
    const prev = latest.per_topic_scores[ct.topic] ?? ct.avg_score;
    const topicDelta = ct.avg_score - prev;
    let topicTrend: Trend;
    if (topicDelta > STALL_THRESHOLD) {
      topicTrend = 'improving';
    } else if (topicDelta < -STALL_THRESHOLD) {
      topicTrend = 'regressing';
    } else {
      topicTrend = 'stalled';
    }
    return {
      topic: ct.topic,
      previous: round(prev),
      current: round(ct.avg_score),
      delta: round(topicDelta),
      trend: topicTrend,
    };
  });

  // Count consecutive stalls (looking backward through history)
  let stallCount = 0;
  if (trend === 'stalled') {
    stallCount = 1;
    for (let i = history.length - 1; i > 0; i--) {
      const prevDelta = history[i].mean_score - history[i - 1].mean_score;
      if (Math.abs(prevDelta) < STALL_THRESHOLD) {
        stallCount++;
      } else {
        break;
      }
    }
  }

  return {
    iteration_number: latest.iteration + 1,
    previous_mean: round(latest.mean_score),
    current_mean: round(currentMean),
    delta: round(delta),
    trend,
    per_topic_deltas: topicDeltas,
    stall_count: stallCount,
  };
}

// =============================================================================
// Stall Escalation (Decision Tree Section 6)
// =============================================================================

const ESCALATION_LEVELS: Array<{ level: 1 | 2 | 3 | 4 | 5 | 6; description: string }> = [
  { level: 1, description: 'Targeted data fix — read grader reasons, fix specific prompts' },
  { level: 2, description: 'Grader refinement — add partial credit, contrastive examples, or split grader' },
  { level: 3, description: 'Data expansion — add 30-50% more records, focus on weak topics' },
  { level: 4, description: 'Structural change — restructure topics, change prompt strategy' },
  { level: 5, description: 'Configuration change — adjust training hyperparameters' },
  { level: 6, description: 'Fundamental reassessment — consider stronger model, simpler task, or accept current performance' },
];

function determineEscalation(
  stallCount: number,
  iterationCount: number,
): Escalation | null {
  if (stallCount < STALL_ITERATIONS_NEEDED) return null;

  // Escalation level based on how many iterations have stalled
  const levelIndex = Math.min(stallCount - STALL_ITERATIONS_NEEDED, ESCALATION_LEVELS.length - 1);
  const escalation = ESCALATION_LEVELS[levelIndex];

  return {
    level: escalation.level,
    description: escalation.description,
    reason: `Scores stalled for ${stallCount} consecutive iterations (${iterationCount} total iterations)`,
  };
}

// =============================================================================
// Recommendation Generator
// =============================================================================

function generateRecommendations(
  health: HealthAssessment,
  topics: TopicAnalysis[],
  grader: GraderHealth,
  comparison: IterationComparison | null,
  escalation: Escalation | null,
): Recommendation[] {
  const recs: Recommendation[] = [];

  // Mean-based recommendations (Step A)
  if (health.mean_verdict === 'hard_stop') {
    recs.push({
      priority: 'high',
      lever: 'grader',
      action: 'Model cannot do this task. Try easier prompts, a different base model, or a much simpler grader.',
      rationale: `Mean score ${health.mean_score.toFixed(3)} is below ${SCORE_RANGES.HARD_STOP} — no learning signal`,
    });
  } else if (health.mean_verdict === 'too_hard') {
    recs.push({
      priority: 'high',
      lever: 'grader',
      action: 'Loosen grader criteria and add partial credit scoring',
      rationale: `Mean score ${health.mean_score.toFixed(3)} is below ${SCORE_RANGES.WARNING_LOW} — grader may be too strict`,
    });
  } else if (health.mean_verdict === 'too_easy') {
    recs.push({
      priority: 'high',
      lever: 'grader',
      action: 'Tighten grader criteria significantly and add challenging records',
      rationale: `Mean score ${health.mean_score.toFixed(3)} is above ${SCORE_RANGES.WARNING_HIGH} — minimal learning potential`,
    });
  } else if (health.mean_verdict === 'getting_easy') {
    recs.push({
      priority: 'medium',
      lever: 'grader',
      action: 'Consider tightening grader criteria or adding harder prompts',
      rationale: `Mean score ${health.mean_score.toFixed(3)} is above ${SCORE_RANGES.HEALTHY_HIGH} — getting easy`,
    });
  }

  // Std-based recommendations (Step B)
  if (health.std_verdict === 'no_differentiation') {
    recs.push({
      priority: 'high',
      lever: 'grader',
      action: 'Add more granular scoring criteria with partial credit',
      rationale: `Std ${health.std_score.toFixed(3)} below ${STD_RANGES.NO_DIFFERENTIATION} — grader gives everything similar scores`,
    });
  } else if (health.std_verdict === 'bimodal') {
    recs.push({
      priority: 'medium',
      lever: 'grader',
      action: 'Add intermediate scoring levels — grader appears binary (pass/fail)',
      rationale: `Std ${health.std_score.toFixed(3)} above ${STD_RANGES.BIMODAL} — distribution may be bimodal`,
    });
  }

  // Grader health recommendations (Step D)
  if (grader.binary_scoring) {
    recs.push({
      priority: 'medium',
      lever: 'grader',
      action: 'Add partial credit — over 80% of scores are binary (0 or 1)',
      rationale: 'Binary scoring limits training signal granularity',
    });
  }

  // Topic-specific recommendations (Step C)
  const failingTopics = topics.filter((t) => t.classification === 'failing');
  const weakTopics = topics.filter((t) => t.classification === 'weak');
  const lowCountTopics = topics.filter((t) => t.record_count < MIN_RECORDS_PER_TOPIC);

  if (failingTopics.length > 0) {
    recs.push({
      priority: 'high',
      lever: 'records',
      action: `Fix failing topics: ${failingTopics.map((t) => t.topic).join(', ')}`,
      target_topics: failingTopics.map((t) => t.topic),
      rationale: `${failingTopics.length} topic(s) scoring below 0.20 — check grader reasons and fix prompts`,
    });
  }

  if (weakTopics.length > 0) {
    recs.push({
      priority: 'medium',
      lever: 'records',
      action: `Improve weak topics: ${weakTopics.map((t) => t.topic).join(', ')}`,
      target_topics: weakTopics.map((t) => t.topic),
      rationale: `${weakTopics.length} topic(s) scoring 0.20–0.50 — read grader reasons for targeted fixes`,
    });
  }

  if (lowCountTopics.length > 0) {
    recs.push({
      priority: 'medium',
      lever: 'distribution',
      action: `Add more records to: ${lowCountTopics.map((t) => `${t.topic} (${t.record_count})`).join(', ')}`,
      target_topics: lowCountTopics.map((t) => t.topic),
      rationale: `${lowCountTopics.length} topic(s) have fewer than ${MIN_RECORDS_PER_TOPIC} records`,
    });
  }

  // Pattern: All topics similar — grader not differentiating between topics
  if (topics.length >= 2) {
    const topicScores = topics.map((t) => t.avg_score);
    const maxScore = Math.max(...topicScores);
    const minScore = Math.min(...topicScores);
    if (maxScore - minScore < ALL_TOPICS_SIMILAR_THRESHOLD) {
      recs.push({
        priority: 'medium',
        lever: 'grader',
        action: 'All topics score similarly — grader may not differentiate between topics',
        rationale: `Score range across ${topics.length} topics is only ${(maxScore - minScore).toFixed(3)}`,
      });
    }
  }

  // Cross-iteration recommendations (Step E)
  if (comparison?.trend === 'regressing') {
    const regressingTopics = comparison.per_topic_deltas.filter((t) => t.trend === 'regressing');
    recs.push({
      priority: 'high',
      lever: 'records',
      action: `Score regression detected (${comparison.delta.toFixed(3)}). Investigate recent changes.`,
      target_topics: regressingTopics.map((t) => t.topic),
      rationale: regressingTopics.length > 0
        ? `Regressing topics: ${regressingTopics.map((t) => `${t.topic} (${t.delta.toFixed(3)})`).join(', ')}`
        : 'Overall mean declined from previous iteration',
    });
  }

  // Escalation recommendation
  if (escalation) {
    recs.push({
      priority: 'high',
      lever: escalation.level <= 2 ? 'grader' : escalation.level <= 4 ? 'topics' : 'training_config',
      action: escalation.description,
      rationale: escalation.reason,
    });
  }

  // Pattern: Ambiguous task — high variance + stalled
  if (
    health.std_verdict === 'bimodal' &&
    comparison?.trend === 'stalled' &&
    comparison.stall_count >= STALL_ITERATIONS_NEEDED
  ) {
    recs.push({
      priority: 'high',
      lever: 'topics',
      action: 'Task may be ambiguous — narrow scope or split into clearer sub-tasks',
      rationale: `High variance (std: ${health.std_score.toFixed(3)}) combined with ${comparison.stall_count} stalled iterations`,
    });
  }

  // Sort by priority
  const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  return [...recs].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

// =============================================================================
// Next Action Decision
// =============================================================================

function decideNextAction(
  health: HealthAssessment,
  comparison: IterationComparison | null,
  escalation: Escalation | null,
  topics: TopicAnalysis[],
): NextAction {
  if (health.mean_verdict === 'hard_stop') return 'hard_stop';
  if (escalation && escalation.level >= 5) return 'escalate';

  const hasFailingTopics = topics.some((t) => t.classification === 'failing');
  const hasWeakTopics = topics.some((t) => t.classification === 'weak');
  const hasProblems = health.overall === 'critical' || health.overall === 'warning';

  // If healthy and no major issues, suggest training
  if (health.mean_verdict === 'healthy_range' && !hasFailingTopics && !hasProblems) {
    // But if stalled, escalate
    if (comparison?.trend === 'stalled' && comparison.stall_count >= STALL_ITERATIONS_NEEDED) {
      return 'escalate';
    }
    return 'train';
  }

  // If issues exist but manageable, iterate
  if (hasFailingTopics || hasWeakTopics || hasProblems) {
    return 'iterate';
  }

  return 'train';
}

// =============================================================================
// Handler
// =============================================================================

export const analyzeEvaluationHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, evaluation_id } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    // 1. Fetch eval details (reuse Phase 1 handler)
    const evalResult = await getEvaluationDetailsHandler({
      workflow_id,
      evaluation_id,
      sort_by: 'score_asc',
      limit: 100,
    }) as Record<string, unknown>;

    if (!evalResult.success) {
      return { success: false, error: evalResult.error ?? 'Failed to get evaluation details' };
    }

    const summary = evalResult.summary as {
      total_records: number;
      scored_records: number;
      mean_score: number;
      std_score: number;
      min_score: number | null;
      max_score: number | null;
      pass_rate: number;
    };

    const perTopic = evalResult.per_topic as Array<{
      topic: string;
      record_count: number;
      avg_score: number;
      min_score: number;
      max_score: number;
      pass_count: number;
      fail_count: number;
    }>;

    const worstRecords = (evalResult.worst_records ?? []) as Array<{
      record_id: string;
      topic: string;
      score: number;
      reason: string;
    }>;

    // 2. Fetch iteration history (reuse Phase 1 handler)
    const historyResult = await getIterationHistoryHandler({ workflow_id }) as Record<string, unknown>;

    const history = (historyResult.success && historyResult.history)
      ? historyResult.history as Array<{
          iteration: number;
          mean_score: number;
          per_topic_scores: Record<string, number>;
        }>
      : [];

    // 3. Step A+B: Classify score health
    const health = assessHealth(summary);

    // Compute percent_perfect from all records if available
    const perfectCount = worstRecords.filter((r) => r.score === 1).length;
    if (summary.scored_records > 0) {
      health.percent_perfect = round(perfectCount / worstRecords.length);
    }

    // 4. Step C: Per-topic analysis
    const topicAnalysis = analyzeTopics(perTopic);

    // 5. Step D: Grader health
    const graderHealth = assessGraderHealth(worstRecords, summary);

    // 6. Step E: Cross-iteration comparison
    const iterComparison = computeIterationComparison(
      history,
      summary.mean_score,
      perTopic.map((t) => ({ topic: t.topic, avg_score: t.avg_score })),
    );

    // 7. Stall escalation
    const escalation = iterComparison
      ? determineEscalation(iterComparison.stall_count, history.length + 1)
      : null;

    // 8. Recommendations
    const recommendations = generateRecommendations(
      health,
      topicAnalysis,
      graderHealth,
      iterComparison,
      escalation,
    );

    // 9. Next action (adjusted if training already completed)
    let nextAction = decideNextAction(health, iterComparison, escalation, topicAnalysis);

    // If next_action is 'train' but training already succeeded, skip re-training
    if (nextAction === 'train') {
      try {
        const workflow = await workflowService.getByDataset(workflow_id);
        if (workflow?.training?.status === 'completed') {
          nextAction = 'iterate';
        }
      } catch {
        // Non-critical — proceed with original decision
      }
    }

    // 9b. Fetch evaluator version context (non-critical)
    let evaluator_version: { version: number; created_at: string; has_diff: boolean } | undefined;
    try {
      const dataset = await datasetService.getById(workflow_id);
      if (dataset) {
        const versions = await getEvaluatorVersions(dataset.id);
        if (versions.length > 0) {
          const latest = versions[0];
          evaluator_version = {
            version: latest.version,
            created_at: latest.created_at,
            has_diff: latest.diff != null,
          };
        }
      }
    } catch {
      // Non-critical — evaluator versions may not exist yet
    }

    // 10. Auto-log this iteration so future calls have history for comparison.
    //     Fire-and-forget — logging failure should not break analysis results.
    const iterationNumber = history.length + 1;
    const evalId = typeof evaluation_id === 'string' ? evaluation_id : 'unknown';
    try {
      await logIterationHandler({
        workflow_id,
        eval_id: evalId,
        scores: {
          mean: summary.mean_score,
          per_topic: Object.fromEntries(perTopic.map((t) => [t.topic, t.avg_score])),
        },
        decision: nextAction === 'hard_stop' ? 'escalate' : nextAction,
        changes_made: recommendations.map((r) => r.action).join('; '),
        phase: nextAction === 'train' ? 'training' : 'awaiting_user',
      });
    } catch {
      // Non-critical — iteration history is best-effort
    }

    return {
      success: true,
      iteration_number: iterationNumber,
      health,
      per_topic: topicAnalysis,
      grader_health: graderHealth,
      ...(iterComparison ? { iteration_comparison: iterComparison } : {}),
      ...(escalation ? { escalation } : {}),
      recommendations,
      next_action: nextAction,
      evaluator_version,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze evaluation',
    };
  }
};

// =============================================================================
// Helpers
// =============================================================================

function round(n: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

// =============================================================================
// Tool Definition
// =============================================================================

export const analyzeEvaluationTool: DistriFnTool = {
  name: 'analyze_evaluation',
  description:
    'Analyze dry run evaluation results using the RFT decision tree. Returns structured health assessment, per-topic classification, stall detection, and specific lever recommendations. Call this after an evaluation completes to determine whether to iterate, train, or escalate.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The dataset ID to analyze',
      },
      evaluation_id: {
        type: 'string',
        description: 'Specific evaluation job ID. If omitted, uses the most recent completed evaluation.',
      },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await analyzeEvaluationHandler(input as Record<string, unknown>)),
} as DistriFnTool;
