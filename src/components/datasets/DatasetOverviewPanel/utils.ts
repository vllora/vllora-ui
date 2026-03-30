/**
 * Helper functions for DatasetOverviewPanel.
 */

import { emitter } from "@/utils/eventEmitter";
import type { EvalJob } from "@/types/eval-job";
import { getJobAverageScore } from "@/types/eval-job";
import type { EvalStats, ScoreDistribution } from "@/types/dataset-types";
import type { FinetuneJob } from "@/services/finetune-api";
import type { Plan } from "@/lib/distri-finetune-tools/steps/propose-plan/types";
import type {
  ActivityCategoryBadge,
  ActivityDetailBlock,
  ActivityDetailTone,
  ActivityDistributionBin,
  ActivityMetric,
  StepDetailContext,
} from "./types";

// =============================================================================
// Constants
// =============================================================================

export const OPEN_DRY_RUN_JOB_EVENT = "vllora_select_dry_run_job";
export const OPEN_FINETUNE_JOB_EVENT = "vllora_select_finetune_job";

export const DETAIL_TONE_CLASS: Record<ActivityDetailTone, string> = {
  default: "text-foreground",
  success: "text-green-600 dark:text-green-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-destructive",
};

// =============================================================================
// Type Guards
// =============================================================================

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

// =============================================================================
// Formatters
// =============================================================================

export function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function truncateMiddle(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function formatTrainingConfigValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `${value}`;
    if (Number.isInteger(value)) return `${value}`;

    const abs = Math.abs(value);
    if (abs > 0 && (abs < 1e-8 || abs >= 1e9)) {
      return value.toExponential(2).replace(/e\+?/, "e");
    }

    const decimals =
      abs >= 1
        ? 3
        : Math.min(8, Math.max(3, Math.ceil(-Math.log10(abs)) + 2));

    const fixed = value.toFixed(decimals);
    return fixed
      .replace(/(\.\d*?[1-9])0+$/, "$1")
      .replace(/\.0+$/, "")
      .replace(/^-0$/, "0");
  }
  if (typeof value === "string") return value;
  return undefined;
}

// =============================================================================
// Navigation
// =============================================================================

export function navigateToEvalJob(workflowId: string, jobId: string): void {
  emitter.emit("vllora_switch_tab", { workflowId, tab: "evaluator" });
  setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent(OPEN_DRY_RUN_JOB_EVENT, {
        detail: { workflowId, jobId },
      })
    );
  }, 150);
}

export function navigateToFinetuneJob(workflowId: string, jobId: string): void {
  emitter.emit("vllora_switch_tab", { workflowId, tab: "jobs" });
  setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent(OPEN_FINETUNE_JOB_EVENT, {
        detail: { workflowId, jobId },
      })
    );
  }, 150);
}

// =============================================================================
// Badge / Tone helpers
// =============================================================================

export function getStepCategoryBadge(stepId: string): ActivityCategoryBadge | undefined {
  if (["topics", "adjust_topics", "categorize", "generate", "upload"].includes(stepId)) {
    return { label: "Data", tone: "data" };
  }
  if (["grader", "dryrun"].includes(stepId)) {
    return { label: "Eval", tone: "eval" };
  }
  if (stepId === "finetune") {
    return { label: "Fine-tune", tone: "finetune" };
  }
  return undefined;
}

export function getVerdictTone(verdict: string | undefined): ActivityDetailTone {
  if (!verdict) return "default";
  if (verdict === "GO") return "success";
  if (verdict === "WARNING") return "warning";
  if (verdict === "NO-GO") return "danger";
  return "default";
}

// =============================================================================
// Data builders
// =============================================================================

export function scoreDistributionToBins(
  distribution?: Partial<ScoreDistribution> | null,
  options?: { keepZeros?: boolean }
): ActivityDistributionBin[] {
  if (!distribution) return [];
  const order: Array<keyof ScoreDistribution> = [
    "0.0-0.2",
    "0.2-0.4",
    "0.4-0.6",
    "0.6-0.8",
    "0.8-1.0",
  ];
  return order
    .map((label) => ({
      label,
      value: asNumber(distribution[label]) ?? 0,
    }))
    .filter((bin) => (options?.keepZeros ? true : bin.value > 0));
}

export function topTopicBins(
  topicDistribution?: Record<string, number>,
  maxBins = 6
): ActivityDistributionBin[] {
  if (!topicDistribution) return [];
  return Object.entries(topicDistribution)
    .filter(([, count]) => typeof count === "number" && count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxBins)
    .map(([label, value]) => ({ label, value }));
}

export function buildQualityDistributionBlock(
  evalStats?: EvalStats | null
): ActivityDetailBlock | undefined {
  if (!evalStats?.distribution) return undefined;
  const bins = scoreDistributionToBins(evalStats.distribution, { keepZeros: true });
  if (bins.length === 0 || bins.every((bin) => bin.value === 0)) return undefined;
  const mean = evalStats.statistics?.mean;
  const samples = evalStats.samplesEvaluated;
  const footerBits = [
    mean != null ? `Mean ${Math.round(mean * 100)}%` : undefined,
    samples != null ? `${samples} samples` : undefined,
  ].filter(Boolean) as string[];
  return {
    type: "distribution_bars",
    title: "Quality Distribution",
    bins,
    footer: footerBits.length ? footerBits.join(" · ") : undefined,
    lowToHighLabels: true,
    scoreStrip: true,
    mean: mean ?? undefined,
  };
}

export function getLeafTopicNames(topics?: Plan["proposed_topics"]): string[] {
  if (!topics?.length) return [];
  const names: string[] = [];

  const visit = (nodes: NonNullable<Plan["proposed_topics"]>) => {
    for (const node of nodes) {
      if (node.subtopics?.length) {
        visit(node.subtopics);
      } else if (node.name?.trim()) {
        names.push(node.name.trim());
      }
    }
  };

  visit(topics);
  return names;
}

export function buildFinetuneConfigRows(job: FinetuneJob): Array<{ key: string; value: string }> {
  const cfg = asRecord(job.training_config);
  if (!cfg) return [];
  const mappings: Array<[string, string]> = [
    ["epochs", "Epochs"],
    ["batch_size", "Batch Size"],
    ["lora_rank", "LoRA Rank"],
    ["learning_rate", "Learning Rate"],
    ["gradient_accumulation_steps", "Grad Accum"],
  ];
  return mappings
    .map(([key, label]) => {
      const value = formatTrainingConfigValue(cfg[key]);
      return value ? { key: label, value } : null;
    })
    .filter((row): row is { key: string; value: string } => row != null);
}

// =============================================================================
// Detail builders
// =============================================================================

export function getEvalStatsForEvaluationJob(
  job: EvalJob,
  datasetEvalStats?: EvalStats | null
): EvalStats | undefined {
  if (job.result) return job.result;
  if (datasetEvalStats?.evaluationRunId && datasetEvalStats.evaluationRunId === job.evaluationRunId) {
    return datasetEvalStats;
  }
  return undefined;
}

export function getEvalStatsForStep(
  stepResult: Record<string, unknown> | null,
  dryRunJobs: EvalJob[],
  datasetEvalStats?: EvalStats | null
): { job?: EvalJob; stats?: EvalStats } {
  const dryRunJobId = asString(stepResult?.dry_run_job_id);
  const matchedJob = dryRunJobId
    ? dryRunJobs.find((job) => job.id === dryRunJobId)
    : dryRunJobs
        .filter((job) => job.status !== "pending")
        .sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt))[0];
  const stats = matchedJob
    ? getEvalStatsForEvaluationJob(matchedJob, datasetEvalStats)
    : datasetEvalStats ?? undefined;
  return { job: matchedJob, stats };
}

export function getFinetuneJobForStep(
  stepResult: Record<string, unknown> | null,
  jobs: FinetuneJob[]
): FinetuneJob | undefined {
  const jobId =
    asString(stepResult?.jobId) ??
    asString(stepResult?.job_id) ??
    asString(stepResult?.id);
  if (jobId) return jobs.find((job) => job.id === jobId);
  return [...jobs].sort(
    (a, b) =>
      new Date(b.completed_at ?? b.created_at).getTime() -
      new Date(a.completed_at ?? a.created_at).getTime()
  )[0];
}

export function getStepDetails({
  stepId,
  stepResult,
  plan,
  dataset,
  dryRunJobs,
  finetuneJobs,
}: StepDetailContext): ActivityDetailBlock[] | undefined {
  const r = asRecord(stepResult);
  const details: ActivityDetailBlock[] = [];

  if (stepId === "topics") {
    const topicNames = getLeafTopicNames(plan?.proposed_topics);
    if (topicNames.length) {
      details.push({
        type: "tag_list",
        title: "Generated Topics",
        items: topicNames,
        maxVisible: topicNames.length,
      });
    }

    const topicCount =
      asNumber(r?.topic_count) ??
      plan?.total_topic_count ??
      topicNames.length;
    const depth = asNumber(dataset?.topicHierarchy?.depth);
    const metrics: ActivityMetric[] = [];
    if (topicCount != null) metrics.push({ label: "Topics Applied", value: `${topicCount}` });
    if (depth != null) metrics.push({ label: "Hierarchy Depth", value: `${depth}` });
    if (metrics.length) details.push({ type: "metric_grid", metrics });
  } else if (stepId === "adjust_topics") {
    const changes = asStringArray(r?.changes_made);
    if (changes.length) {
      details.push({
        type: "tag_list",
        title: "Changes Made",
        items: changes,
        maxVisible: 6,
      });
    }
    const metrics: ActivityMetric[] = [];
    const topicCount = asNumber(r?.topic_count);
    const depth = asNumber(dataset?.topicHierarchy?.depth);
    if (topicCount != null) metrics.push({ label: "Topic Count", value: `${topicCount}` });
    if (depth != null) metrics.push({ label: "Depth", value: `${depth}` });
    if (metrics.length) details.push({ type: "metric_grid", metrics });
  } else if (stepId === "categorize") {
    const categorization = asRecord(r?.categorization);
    const assignedCount = asNumber(categorization?.assigned_count);
    const topicDistribution = dataset?.coverageStats?.topicDistribution;
    const topicsCovered = topicDistribution
      ? Object.values(topicDistribution).filter((count) => (count ?? 0) > 0).length
      : undefined;
    const uncategorized =
      asNumber(dataset?.coverageStats?.uncategorizedCount) ??
      asNumber(dataset?.stats?.uncategorizedCount);
    const metrics: ActivityMetric[] = [];
    if (assignedCount != null) metrics.push({ label: "Assigned", value: `${assignedCount}` });
    if (topicsCovered != null) metrics.push({ label: "Topics Covered", value: `${topicsCovered}` });
    if (uncategorized != null) metrics.push({ label: "Uncategorized", value: `${uncategorized}` });
    if (metrics.length) {
      details.push({ type: "metric_grid", title: "Categorization", metrics });
    }
    const bins = topTopicBins(topicDistribution, 6);
    if (bins.length) {
      details.push({
        type: "distribution_bars",
        title: "Topic Distribution",
        bins,
      });
    }
  } else if (stepId === "generate") {
    const created = asNumber(r?.records_created);
    const knowledgeSources = asNumber(r?.knowledge_sources_used);
    const totalRecords = asNumber(dataset?.stats?.totalRecords);
    const generatedRecords = asNumber(dataset?.stats?.generatedRecords);
    const metrics: ActivityMetric[] = [];
    if (created != null) metrics.push({ label: "Examples Created", value: `${created}` });
    if (knowledgeSources != null) metrics.push({ label: "Knowledge Sources", value: `${knowledgeSources}` });
    if (
      generatedRecords != null &&
      totalRecords != null &&
      totalRecords > 0
    ) {
      metrics.push({
        label: "Generated Share",
        value: formatPercent(generatedRecords / totalRecords),
      });
    }
    if (metrics.length) {
      details.push({ type: "metric_grid", title: "Generation Output", metrics });
    }
    const qualityBlock = buildQualityDistributionBlock(dataset?.evalStats);
    if (qualityBlock) {
      details.push(qualityBlock);
    } else {
      const bins = topTopicBins(dataset?.coverageStats?.topicDistribution, 6);
      if (bins.length) {
        details.push({
          type: "distribution_bars",
          title: "Topic Distribution",
          bins,
        });
      }
    }
    if (created != null) {
      details.push({
        type: "result_footer",
        title: "Result",
        value: `${created} training examples created`,
      });
    }
  } else if (stepId === "grader") {
    const criteria = plan?.grader_config?.criteria?.map((c) => c.name).filter(Boolean) ?? [];
    if (criteria.length) {
      details.push({
        type: "tag_list",
        title: "Evaluation Criteria",
        items: criteria,
        maxVisible: 6,
      });
    }
    const graderType = asString(r?.grader_type);
    const metrics: ActivityMetric[] = [];
    if (graderType) metrics.push({ label: "Grader Type", value: graderType });
    if (criteria.length) metrics.push({ label: "Criteria", value: `${criteria.length}` });
    if (metrics.length) details.push({ type: "metric_grid", metrics });
  } else if (stepId === "upload") {
    const rows: Array<{ key: string; value: string }> = [];
    if (dataset?.id) {
      rows.push({
        key: "Backend ID",
        value: truncateMiddle(dataset.id),
      });
    }
    const alreadyUploaded = Boolean((r as Record<string, unknown> | null)?.already_uploaded);
    rows.push({ key: "Status", value: alreadyUploaded ? "Already uploaded" : "Uploaded" });
    if (rows.length) details.push({ type: "kv_list", title: "Upload", rows });
  } else if (stepId === "dryrun") {
    const { stats, job } = getEvalStatsForStep(r, dryRunJobs, dataset?.evalStats);
    const verdict = asString(stats?.diagnosis?.verdict);
    const sampleSize = asNumber(r?.sample_size) ?? stats?.samplesEvaluated ?? job?.sampleSize;
    const samplePct =
      asNumber(r?.sample_percentage) ??
      stats?.samplePercentage;
    const metrics: ActivityMetric[] = [];
    if (sampleSize != null) metrics.push({ label: "Samples", value: `${sampleSize}` });
    if (samplePct != null) metrics.push({ label: "Sample %", value: `${samplePct}%` });
    if (verdict) metrics.push({ label: "Verdict", value: verdict, tone: getVerdictTone(verdict) });
    if (metrics.length) details.push({ type: "metric_grid", title: "Evaluation", metrics });
    const qualityBlock = buildQualityDistributionBlock(stats);
    if (qualityBlock) details.push(qualityBlock);
    if (stats?.statistics) {
      details.push({
        type: "result_footer",
        value: `Mean ${Math.round(stats.statistics.mean * 100)}% · Std ${Math.round(
          stats.statistics.std * 100
        )}%`,
      });
    }
  } else if (stepId === "finetune") {
    const matchedJob = getFinetuneJobForStep(r, finetuneJobs);
    if (matchedJob) {
      details.push(...(getFinetuneDetails(matchedJob) ?? []));
    }
  }

  return details.length ? details : undefined;
}

export function getEvaluationDetails(
  job: EvalJob,
  datasetEvalStats?: EvalStats | null
): ActivityDetailBlock[] | undefined {
  const details: ActivityDetailBlock[] = [];
  const stats = getEvalStatsForEvaluationJob(job, datasetEvalStats);
  const avg = stats?.statistics.mean ?? getJobAverageScore(job);
  const passed = asNumber(job.pollingSnapshot?.summary?.passed_count);
  const failed = asNumber(job.pollingSnapshot?.summary?.failed_count);

  const metrics: ActivityMetric[] = [];
  if (avg != null) metrics.push({ label: "Average Score", value: formatPercent(avg) });
  metrics.push({ label: "Samples", value: `${job.sampleSize}` });
  if (passed != null || failed != null) {
    metrics.push({
      label: "Score >0.5 / Errors",
      value: `${passed ?? 0}/${failed ?? 0}`,
      tone: failed && failed > 0 ? "warning" : "default",
    });
  }
  if (job.rolloutModel) metrics.push({ label: "Model", value: job.rolloutModel });
  if (metrics.length) details.push({ type: "metric_grid", title: "Evaluation", metrics });

  const qualityBlock = buildQualityDistributionBlock(stats);
  if (qualityBlock) {
    details.push({ ...qualityBlock, title: "Score Distribution" });
  }

  const recs = stats?.diagnosis?.recommendations?.slice(0, 3) ?? [];
  if (job.status === "completed" && recs.length) {
    details.push({
      type: "tag_list",
      title: "Recommendations",
      items: recs,
      maxVisible: 3,
    });
  }

  return details.length ? details : undefined;
}

export function getFinetuneDetails(job: FinetuneJob): ActivityDetailBlock[] | undefined {
  const details: ActivityDetailBlock[] = [];
  const metrics: ActivityMetric[] = [
    { label: "Base Model", value: job.base_model },
  ];
  if (job.fine_tuned_model) {
    metrics.push({ label: "Output Model", value: job.fine_tuned_model });
  }
  details.push({ type: "metric_grid", title: "Training", metrics });

  const configRows = buildFinetuneConfigRows(job);
  if (configRows.length) {
    details.push({ type: "kv_list", title: "Config", rows: configRows });
  }

  return details.length ? details : undefined;
}
