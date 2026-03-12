/**
 * Get Training Metrics Tool
 *
 * Fetches raw GRPO/GSPO reinforcement training metrics (reward, KL, loss,
 * grad_norm, completion stats) and applies the metrics cheatsheet thresholds
 * to detect issues (KL drift, truncation, instability, weak signal).
 *
 * This is complementary to analyze_training which uses per-epoch eval scores.
 * This tool provides low-level training telemetry for deeper diagnostics.
 */

import type { DistriFnTool } from '@distri/core';
import type { ToolHandler } from '../types';
import {
  getFinetuneJobMetrics,
  getFinetuneJobStatus,
  listFinetuneJobs,
} from '@/services/finetune-api';
import type { TrainingMetricsSnapshot } from '@/services/finetune-api';
import { datasetService, workflowService } from '@/services/service-registry';

// =============================================================================
// Alert Thresholds (from reinforcement_metrics_cheatsheet.md)
// =============================================================================

const CLIPPED_RATIO_RED = 0.7;
const CLIPPED_RATIO_YELLOW = 0.2;
const REWARD_STD_YELLOW = 0.3;
const FRAC_REWARD_ZERO_STD_RED = 0.6;
const FRAC_REWARD_ZERO_STD_YELLOW = 0.3;
const CONSECUTIVE_STEPS_FOR_ALERT = 5;

// =============================================================================
// Types
// =============================================================================

type AlertSeverity = 'critical' | 'warning' | 'info';

interface MetricsAlert {
  readonly severity: AlertSeverity;
  readonly metric: string;
  readonly message: string;
  readonly value?: number;
  readonly threshold?: number;
}

interface MetricsSummary {
  readonly total_steps: number;
  readonly latest_step: number;
  readonly max_steps: number | null;
  readonly progress_percent: number | null;
  readonly latest_epoch: number | null;
  readonly latest_learning_rate: number | null;
}

interface RewardSummary {
  readonly latest: number | null;
  readonly trend: 'improving' | 'flat' | 'declining' | 'unknown';
  readonly latest_std: number | null;
  readonly frac_zero_std: number | null;
}

interface StabilitySummary {
  readonly latest_loss: number | null;
  readonly latest_kl: number | null;
  readonly kl_trend: 'stable' | 'rising' | 'unknown';
  readonly latest_grad_norm: number | null;
  readonly has_nan: boolean;
}

interface CompletionSummary {
  readonly latest_clipped_ratio: number | null;
  readonly latest_mean_length: number | null;
  readonly latest_terminated_length: number | null;
  readonly truncation_issue: boolean;
}

export interface GetTrainingMetricsResult {
  readonly success: boolean;
  readonly error?: string;
  readonly job_id?: string;
  readonly job_status?: string;
  readonly progress?: MetricsSummary;
  readonly reward?: RewardSummary;
  readonly stability?: StabilitySummary;
  readonly completions?: CompletionSummary;
  readonly alerts?: readonly MetricsAlert[];
  readonly raw_latest?: TrainingMetricsSnapshot;
}

// =============================================================================
// Job Resolution (shared pattern with analyze-training)
// =============================================================================

async function resolveJobId(
  workflowId: string,
  jobId?: string,
): Promise<string> {
  if (jobId) return jobId;

  const workflow = await workflowService.getByDataset(workflowId);
  if (workflow?.training?.jobId) return workflow.training.jobId;

  const dataset = await datasetService.getById(workflowId);
  if (!dataset) {
    throw new Error('Dataset not found');
  }

  // The dataset ID is the backend dataset ID — they are always the same.
  const jobs = await listFinetuneJobs(dataset.id);
  const active = jobs
    .filter((j) => j.status === 'running' || j.status === 'succeeded' || j.status === 'pending')
    .sort((a, b) => (b.updated_at).localeCompare(a.updated_at));

  if (active.length === 0) {
    throw new Error('No training job found for this dataset');
  }

  return active[0].id;
}

// =============================================================================
// Trend Detection
// =============================================================================

function computeTrend(
  values: (number | undefined)[],
  minPoints: number,
): 'improving' | 'flat' | 'declining' | 'unknown' {
  const filtered = values.filter((v): v is number => v != null && !isNaN(v));
  if (filtered.length < minPoints) return 'unknown';

  const half = Math.floor(filtered.length / 2);
  const firstHalf = filtered.slice(0, half);
  const secondHalf = filtered.slice(half);

  const firstMean = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const secondMean = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;

  const delta = secondMean - firstMean;
  const threshold = 0.01;

  if (delta > threshold) return 'improving';
  if (delta < -threshold) return 'declining';
  return 'flat';
}

function computeKlTrend(
  values: (number | undefined)[],
): 'stable' | 'rising' | 'unknown' {
  const trend = computeTrend(values, 3);
  if (trend === 'improving') return 'rising'; // KL "improving" means rising = bad
  if (trend === 'declining' || trend === 'flat') return 'stable';
  return 'unknown';
}

// =============================================================================
// Alert Generation
// =============================================================================

function generateAlerts(
  snapshots: TrainingMetricsSnapshot[],
): MetricsAlert[] {
  const alerts: MetricsAlert[] = [];
  if (snapshots.length === 0) return alerts;

  const latest = snapshots[snapshots.length - 1];

  // Check for NaN/Inf in critical metrics
  for (const metric of ['loss', 'reward', 'kl', 'grad_norm'] as const) {
    const val = latest[metric];
    if (val != null && (!isFinite(val as number) || isNaN(val as number))) {
      alerts.push({
        severity: 'critical',
        metric,
        message: `${metric} is NaN/Inf — training should be stopped immediately`,
        value: val as number,
      });
    }
  }

  // Completion clipping
  const clippedRatio = latest['completions/clipped_ratio'];
  if (typeof clippedRatio === 'number') {
    if (clippedRatio > CLIPPED_RATIO_RED) {
      const terminatedLen = latest['completions/mean_terminated_length'];
      const isNoTermination = typeof terminatedLen === 'number' && terminatedLen === 0;
      alerts.push({
        severity: 'critical',
        metric: 'completions/clipped_ratio',
        message: isNoTermination
          ? 'All completions are being truncated and model never terminates naturally — increase max_output_tokens or add stop penalty'
          : `${(clippedRatio * 100).toFixed(0)}% of completions clipped by max length`,
        value: clippedRatio,
        threshold: CLIPPED_RATIO_RED,
      });
    } else if (clippedRatio > CLIPPED_RATIO_YELLOW) {
      alerts.push({
        severity: 'warning',
        metric: 'completions/clipped_ratio',
        message: `${(clippedRatio * 100).toFixed(0)}% of completions hitting max length`,
        value: clippedRatio,
        threshold: CLIPPED_RATIO_YELLOW,
      });
    }
  }

  // KL divergence trend
  const recentKl = snapshots.slice(-CONSECUTIVE_STEPS_FOR_ALERT).map((s) => s.kl);
  const klFiltered = recentKl.filter((v): v is number => v != null);
  if (klFiltered.length >= 3) {
    const isRising = klFiltered.every((v, i) => i === 0 || v >= klFiltered[i - 1]);
    if (isRising && klFiltered[klFiltered.length - 1] > klFiltered[0] * 1.5) {
      alerts.push({
        severity: 'warning',
        metric: 'kl',
        message: 'KL divergence is rising — policy is drifting from reference. Consider lowering learning rate.',
        value: klFiltered[klFiltered.length - 1],
      });
    }
  }

  // Grad norm spikes
  const gradNorms = snapshots.map((s) => s.grad_norm).filter((v): v is number => v != null);
  if (gradNorms.length >= 5) {
    const median = [...gradNorms].sort((a, b) => a - b)[Math.floor(gradNorms.length / 2)];
    const recentGradNorm = latest.grad_norm;
    if (typeof recentGradNorm === 'number' && recentGradNorm > median * 3) {
      alerts.push({
        severity: 'warning',
        metric: 'grad_norm',
        message: `Gradient norm spike: ${recentGradNorm.toFixed(2)} vs median ${median.toFixed(2)} (>3x)`,
        value: recentGradNorm,
        threshold: median * 3,
      });
    }
  }

  // Weak learning signal
  const fracZeroStd = latest.frac_reward_zero_std;
  if (typeof fracZeroStd === 'number') {
    if (fracZeroStd > FRAC_REWARD_ZERO_STD_RED) {
      alerts.push({
        severity: 'warning',
        metric: 'frac_reward_zero_std',
        message: `${(fracZeroStd * 100).toFixed(0)}% of groups have zero reward variance — weak learning signal, improve evaluator sensitivity`,
        value: fracZeroStd,
        threshold: FRAC_REWARD_ZERO_STD_RED,
      });
    } else if (fracZeroStd > FRAC_REWARD_ZERO_STD_YELLOW) {
      alerts.push({
        severity: 'info',
        metric: 'frac_reward_zero_std',
        message: `${(fracZeroStd * 100).toFixed(0)}% of groups have zero reward variance — monitor for weakening signal`,
        value: fracZeroStd,
        threshold: FRAC_REWARD_ZERO_STD_YELLOW,
      });
    }
  }

  // Reward std too low early
  const rewardStd = latest.reward_std;
  if (typeof rewardStd === 'number' && rewardStd < 0.05 && snapshots.length > 3) {
    alerts.push({
      severity: 'info',
      metric: 'reward_std',
      message: 'Reward standard deviation very low — diversity may have collapsed',
      value: rewardStd,
    });
  }

  // Reward std too high
  if (typeof rewardStd === 'number' && rewardStd > REWARD_STD_YELLOW) {
    alerts.push({
      severity: 'info',
      metric: 'reward_std',
      message: `Reward std is high (${rewardStd.toFixed(3)}) — noisy reward signal`,
      value: rewardStd,
      threshold: REWARD_STD_YELLOW,
    });
  }

  // Sort by severity
  const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return [...alerts].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

// =============================================================================
// Main Handler
// =============================================================================

export const getTrainingMetricsHandler: ToolHandler = async (params) => {
  try {
    const workflowId = params.workflow_id as string | undefined;
    const jobId = params.job_id as string | undefined;

    if (!workflowId && !jobId) {
      return { success: false, error: 'Either workflow_id or job_id is required' } satisfies GetTrainingMetricsResult;
    }

    if (!workflowId) {
      return { success: false, error: 'workflow_id is required for API calls (workflow scoping)' } satisfies GetTrainingMetricsResult;
    }

    // Resolve job ID
    const resolvedJobId = await resolveJobId(workflowId, jobId);

    // Fetch job status and metrics in parallel
    const [jobStatus, metricsResponse] = await Promise.all([
      getFinetuneJobStatus(workflowId, resolvedJobId),
      getFinetuneJobMetrics(workflowId, resolvedJobId),
    ]);

    const snapshots = metricsResponse.metrics.map((m) => m.metrics);

    if (snapshots.length === 0) {
      return {
        success: true,
        job_id: resolvedJobId,
        job_status: jobStatus.status,
        alerts: [{
          severity: 'info',
          metric: 'metrics',
          message: 'No training metrics available yet — training may still be starting',
        }],
      } satisfies GetTrainingMetricsResult;
    }

    const latest = snapshots[snapshots.length - 1];

    // Progress
    const progress: MetricsSummary = {
      total_steps: snapshots.length,
      latest_step: typeof latest.global_step === 'number' ? latest.global_step : snapshots.length,
      max_steps: typeof latest.max_steps === 'number' ? latest.max_steps : null,
      progress_percent: typeof latest.global_step === 'number' && typeof latest.max_steps === 'number' && latest.max_steps > 0
        ? Math.round((latest.global_step / latest.max_steps) * 100)
        : null,
      latest_epoch: typeof latest.epoch === 'number' ? latest.epoch : null,
      latest_learning_rate: typeof latest.learning_rate === 'number' ? latest.learning_rate : null,
    };

    // Reward
    const rewardValues = snapshots.map((s) => s.reward);
    const reward: RewardSummary = {
      latest: typeof latest.reward === 'number' ? latest.reward : null,
      trend: computeTrend(rewardValues, 3),
      latest_std: typeof latest.reward_std === 'number' ? latest.reward_std : null,
      frac_zero_std: typeof latest.frac_reward_zero_std === 'number' ? latest.frac_reward_zero_std : null,
    };

    // Stability
    const klValues = snapshots.map((s) => s.kl);
    const hasNan = ['loss', 'reward', 'kl', 'grad_norm'].some((k) => {
      const val = latest[k];
      return val != null && (!isFinite(val as number) || isNaN(val as number));
    });
    const stability: StabilitySummary = {
      latest_loss: typeof latest.loss === 'number' ? latest.loss : null,
      latest_kl: typeof latest.kl === 'number' ? latest.kl : null,
      kl_trend: computeKlTrend(klValues),
      latest_grad_norm: typeof latest.grad_norm === 'number' ? latest.grad_norm : null,
      has_nan: hasNan,
    };

    // Completions
    const clippedRatio = latest['completions/clipped_ratio'];
    const meanLen = latest['completions/mean_length'];
    const terminatedLen = latest['completions/mean_terminated_length'];
    const completions: CompletionSummary = {
      latest_clipped_ratio: typeof clippedRatio === 'number' ? clippedRatio : null,
      latest_mean_length: typeof meanLen === 'number' ? meanLen : null,
      latest_terminated_length: typeof terminatedLen === 'number' ? terminatedLen : null,
      truncation_issue: typeof clippedRatio === 'number' && clippedRatio > CLIPPED_RATIO_RED,
    };

    // Alerts
    const alerts = generateAlerts(snapshots);

    return {
      success: true,
      job_id: resolvedJobId,
      job_status: jobStatus.status,
      progress,
      reward,
      stability,
      completions,
      alerts,
      raw_latest: latest,
    } satisfies GetTrainingMetricsResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch training metrics',
    } satisfies GetTrainingMetricsResult;
  }
};

// =============================================================================
// Tool Definition
// =============================================================================

export const getTrainingMetricsTool: DistriFnTool = {
  name: 'get_training_metrics',
  description:
    'Fetch raw reinforcement training metrics (reward, KL divergence, loss, gradient norm, completion stats) for a training job. Returns real-time telemetry with automated alerts for issues like KL drift, truncation, instability, and weak learning signal. Use this during or after training for low-level diagnostics beyond eval scores.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The dataset ID. Used to look up the latest training job if job_id is not provided.',
      },
      job_id: {
        type: 'string',
        description: 'Specific training job ID. If omitted, uses the latest job from the workflow.',
      },
    },
    required: [],
  },
  handler: async (input) =>
    JSON.stringify(await getTrainingMetricsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
