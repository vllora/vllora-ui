/**
 * DatasetOverviewPanel
 *
 * Overview tab layout:
 * - Top: 4 stat cards (Data Coverage, Topic Diversity, Eval Health, Finetune Status)
 * - Bottom dual-pane: Left 60% README viewer | Right 40% Activity Timeline
 */

import { useState, useEffect, useMemo } from "react";
import {
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  SkipForward,
  Circle,
  Zap,
  Target,
  TrendingUp,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DatasetReadmeViewer } from "@/components/datasets/readme-viewer";
import { PlanConsumer } from "@/contexts/PlanContext";
import { DryRunJobsConsumer } from "@/contexts/DryRunJobsContext";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { getStoredPlan } from "@/lib/distri-finetune-tools/steps/proposed-plan-store";
import { computeDatasetInsights, getLeafTopicsFromHierarchy } from "@/components/datasets/record-utils";
import { DatasetOverviewCard } from "@/components/datasets/dataset-detail-header/overview-card/DatasetOverviewCard";
import type { DryRunJob } from "@/types/dry-run-job";
import { getJobCompletedRows, getJobTotalRows, getJobAverageScore } from "@/types/dry-run-job";
import { emitter } from "@/utils/eventEmitter";
import type { ExecutionProgress } from "@/lib/distri-finetune-tools/steps/execute-plan";
import type { Plan } from "@/lib/distri-finetune-tools/steps/propose-plan/types";
import type { FinetuneJob } from "@/services/finetune-api";
import type { Dataset, DryRunStats, ScoreDistribution } from "@/types/dataset-types";

// =============================================================================
// Types
// =============================================================================

type ActivityEntryType = "step" | "evaluation" | "finetune";
type ActivityEntryStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "pending"
  | "skipped";

type ActivityCategoryBadgeTone = "data" | "eval" | "finetune" | "neutral";

interface ActivityCategoryBadge {
  label: string;
  tone: ActivityCategoryBadgeTone;
}

interface ActivityEntry {
  id: string;
  type: ActivityEntryType;
  label: string;
  status: ActivityEntryStatus;
  detail?: string;
  secondaryDetail?: string;
  timestamp?: number;
  progress?: number;
  details?: ActivityDetailBlock[];
  categoryBadge?: ActivityCategoryBadge;
}

type ActivityDetailTone = "default" | "success" | "warning" | "danger";

interface ActivityMetric {
  label: string;
  value: string;
  tone?: ActivityDetailTone;
}

interface ActivityDistributionBin {
  label: string;
  value: number;
}

type ActivityDetailBlock =
  | {
      type: "tag_list";
      title: string;
      items: string[];
      maxVisible?: number;
    }
  | {
      type: "metric_grid";
      title?: string;
      metrics: ActivityMetric[];
    }
  | {
      type: "distribution_bars";
      title: string;
      bins: ActivityDistributionBin[];
      footer?: string;
      lowToHighLabels?: boolean;
      scoreStrip?: boolean;
      mean?: number;
    }
  | {
      type: "kv_list";
      title: string;
      rows: Array<{ key: string; value: string }>;
    }
  | {
      type: "result_footer";
      title?: string;
      value: string;
      tone?: ActivityDetailTone;
    };

// =============================================================================
// Helpers
// =============================================================================

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function getStepCategoryBadge(stepId: string): ActivityCategoryBadge | undefined {
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function truncateMiddle(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

const DETAIL_TONE_CLASS: Record<ActivityDetailTone, string> = {
  default: "text-foreground",
  success: "text-green-600 dark:text-green-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-destructive",
};

function getVerdictTone(verdict: string | undefined): ActivityDetailTone {
  if (!verdict) return "default";
  if (verdict === "GO") return "success";
  if (verdict === "WARNING") return "warning";
  if (verdict === "NO-GO") return "danger";
  return "default";
}

function scoreDistributionToBins(
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

function topTopicBins(
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

function buildQualityDistributionBlock(
  dryRunStats?: DryRunStats | null
): ActivityDetailBlock | undefined {
  if (!dryRunStats?.distribution) return undefined;
  const bins = scoreDistributionToBins(dryRunStats.distribution, { keepZeros: true });
  if (bins.length === 0 || bins.every((bin) => bin.value === 0)) return undefined;
  const mean = dryRunStats.statistics?.mean;
  const samples = dryRunStats.samplesEvaluated;
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

function formatTrainingConfigValue(value: unknown): string | undefined {
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

function getLeafTopicNames(topics?: Plan["proposed_topics"]): string[] {
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

function buildFinetuneConfigRows(job: FinetuneJob): Array<{ key: string; value: string }> {
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

function getDryRunStatsForEvaluationJob(
  job: DryRunJob,
  datasetDryRunStats?: DryRunStats | null
): DryRunStats | undefined {
  if (job.result) return job.result;
  if (datasetDryRunStats?.evaluationRunId && datasetDryRunStats.evaluationRunId === job.evaluationRunId) {
    return datasetDryRunStats;
  }
  return undefined;
}

function getDryRunStatsForStep(
  stepResult: Record<string, unknown> | null,
  dryRunJobs: DryRunJob[],
  datasetDryRunStats?: DryRunStats | null
): { job?: DryRunJob; stats?: DryRunStats } {
  const dryRunJobId = asString(stepResult?.dry_run_job_id);
  const matchedJob = dryRunJobId
    ? dryRunJobs.find((job) => job.id === dryRunJobId)
    : dryRunJobs
        .filter((job) => job.status !== "pending")
        .sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt))[0];
  const stats = matchedJob
    ? getDryRunStatsForEvaluationJob(matchedJob, datasetDryRunStats)
    : datasetDryRunStats ?? undefined;
  return { job: matchedJob, stats };
}

function getFinetuneJobForStep(
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

interface StepDetailContext {
  stepId: string;
  stepResult: unknown;
  plan: Plan | null;
  dataset: Dataset | null | undefined;
  dryRunJobs: DryRunJob[];
  finetuneJobs: FinetuneJob[];
}

function getStepDetails({
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
    const qualityBlock = buildQualityDistributionBlock(dataset?.dryRunStats);
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
    if (dataset?.backendDatasetId) {
      rows.push({
        key: "Backend Dataset ID",
        value: truncateMiddle(dataset.backendDatasetId),
      });
    }
    const alreadyUploaded = Boolean((r as Record<string, unknown> | null)?.already_uploaded);
    rows.push({ key: "Status", value: alreadyUploaded ? "Already uploaded" : "Uploaded" });
    if (rows.length) details.push({ type: "kv_list", title: "Upload", rows });
  } else if (stepId === "dryrun") {
    const { stats, job } = getDryRunStatsForStep(r, dryRunJobs, dataset?.dryRunStats);
    const verdict = asString(stats?.diagnosis?.verdict);
    const sampleSize = asNumber(r?.sample_size) ?? stats?.samplesEvaluated ?? job?.sampleSize;
    const samplePct =
      asNumber(r?.sample_percentage) ??
      stats?.samplePercentage;
    const metrics: ActivityMetric[] = [];
    if (sampleSize != null) metrics.push({ label: "Samples", value: `${sampleSize}` });
    if (samplePct != null) metrics.push({ label: "Sample %", value: `${samplePct}%` });
    if (verdict) metrics.push({ label: "Verdict", value: verdict, tone: getVerdictTone(verdict) });
    if (metrics.length) details.push({ type: "metric_grid", title: "Dry Run", metrics });
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

function getEvaluationDetails(
  job: DryRunJob,
  datasetDryRunStats?: DryRunStats | null
): ActivityDetailBlock[] | undefined {
  const details: ActivityDetailBlock[] = [];
  const stats = getDryRunStatsForEvaluationJob(job, datasetDryRunStats);
  const avg = stats?.statistics.mean ?? getJobAverageScore(job);
  const passed = asNumber(job.pollingSnapshot?.summary?.passed_count);
  const failed = asNumber(job.pollingSnapshot?.summary?.failed_count);

  const metrics: ActivityMetric[] = [];
  if (avg != null) metrics.push({ label: "Average Score", value: formatPercent(avg) });
  metrics.push({ label: "Samples", value: `${job.sampleSize}` });
  if (passed != null || failed != null) {
    metrics.push({
      label: "Pass / Fail",
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

function getFinetuneDetails(job: FinetuneJob): ActivityDetailBlock[] | undefined {
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

// =============================================================================
// Stat Cards
// =============================================================================

function EvalHealthCard({
  currentScore,
  prevScore,
  criteriaCount,
  onClick,
}: {
  currentScore?: number;
  prevScore?: number;
  criteriaCount?: number;
  onClick?: () => void;
}) {
  const hasScore = currentScore != null;
  const scorePercent = hasScore ? Math.round(currentScore * 100) : null;
  const delta =
    hasScore && prevScore != null
      ? Math.round((currentScore - prevScore) * 100 * 10) / 10
      : null;

  return (
    <button
      onClick={onClick}
      className="h-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-4 text-left hover:border-[rgb(var(--theme-500))]/50 transition-colors w-full"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          Evaluation Health
        </span>
        <Target className="w-3.5 h-3.5 text-muted-foreground/60" />
      </div>
      {hasScore ? (
        <>
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-2xl font-bold leading-none">{scorePercent}%</span>
            {delta !== null && (
              <span
                className={cn(
                  "flex items-center text-[10px] font-semibold",
                  delta >= 0 ? "text-green-500" : "text-destructive"
                )}
              >
                {delta >= 0 ? (
                  <ArrowUp className="w-3 h-3" />
                ) : (
                  <ArrowDown className="w-3 h-3" />
                )}
                {delta >= 0 ? "+" : ""}
                {delta}%
              </span>
            )}
          </div>
          {/* Score progress bar */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full bg-[rgb(var(--theme-500))] rounded-full transition-all"
              style={{ width: `${scorePercent}%` }}
            />
          </div>
          <div className="text-[9px] text-muted-foreground">
            Average score{criteriaCount != null ? ` across ${criteriaCount} criteria` : ""}
          </div>
        </>
      ) : (
        <div className="text-xs text-muted-foreground py-1">No evaluations yet</div>
      )}
    </button>
  );
}

function FinetuneStatusCard({ latestJob }: { latestJob: FinetuneJob | null }) {
  const statusConfig = useMemo(() => {
    if (!latestJob) {
      return { label: "NO JOB YET", dotClass: "bg-muted-foreground/40" };
    }
    switch (latestJob.status) {
      case "succeeded":
        return { label: "READY", dotClass: "bg-green-500" };
      case "running":
        return { label: "TRAINING", dotClass: "bg-[rgb(var(--theme-500))] animate-pulse" };
      case "failed":
        return { label: "FAILED", dotClass: "bg-destructive" };
      case "pending":
        return { label: "PENDING", dotClass: "bg-muted-foreground/40" };
      case "cancelled":
        return { label: "CANCELLED", dotClass: "bg-muted-foreground/40" };
      default:
        return { label: "UNKNOWN", dotClass: "bg-muted-foreground/40" };
    }
  }, [latestJob]);

  const modelName = latestJob?.fine_tuned_model ?? latestJob?.base_model;

  return (
    <div className="h-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          Finetune Status
        </span>
        <TrendingUp className="w-3.5 h-3.5 text-muted-foreground/60" />
      </div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={cn("w-2 h-2 rounded-full shrink-0", statusConfig.dotClass)} />
        <span className="text-xs font-bold tracking-wide">{statusConfig.label}</span>
      </div>
      {modelName && (
        <div className="text-[10px] text-muted-foreground truncate">{modelName}</div>
      )}
      {latestJob?.error_message && (
        <div className="text-[10px] text-destructive mt-0.5 truncate">
          {latestJob.error_message}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ActivityTimeline
// =============================================================================

interface ActivityTimelineProps {
  entries: ActivityEntry[];
  isLoading: boolean;
  isLive: boolean;
}

function ActivityTimeline({ entries, isLoading, isLive }: ActivityTimelineProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Activity</span>
        </div>
        {isLive && (
          <div className="flex items-center gap-1 text-[rgb(var(--theme-500))] bg-[rgb(var(--theme-500))]/10 px-2 py-0.5 rounded-full">
            <Zap className="w-3 h-3" />
            <span className="text-[10px] font-semibold uppercase">Live Updates</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 bg-muted animate-pulse rounded" />
                  <div className="h-2.5 w-1/3 bg-muted animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6 py-12">
            <Clock className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No activity yet. Run a plan or evaluation to see history here.
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical connecting line */}
            <div className="absolute left-[25px] top-0 bottom-0 w-px bg-border" />
            {entries.map((entry) => (
              <ActivityEntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// ActivityDetailBlocks
// =============================================================================

function ActivityDetailBlocks({ blocks }: { blocks: ActivityDetailBlock[] }) {
  if (blocks.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 overflow-hidden">
      {blocks.map((block, idx) => {
        const sectionClass = cn("px-3 py-2.5", idx > 0 && "border-t border-border/40");

        if (block.type === "tag_list") {
          const maxVisible = block.maxVisible ?? 6;
          const visible = block.items.slice(0, maxVisible);
          const hiddenCount = Math.max(0, block.items.length - visible.length);
          return (
            <div key={idx} className={sectionClass}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                {block.title}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {visible.map((item, i) => (
                  <span
                    key={`${item}-${i}`}
                    className="px-2 py-0.5 rounded-full bg-background/60 text-xs text-foreground/90 max-w-full truncate"
                    title={item}
                  >
                    {item}
                  </span>
                ))}
                {hiddenCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-background/50 text-xs text-muted-foreground">
                    +{hiddenCount} more
                  </span>
                )}
              </div>
            </div>
          );
        }

        if (block.type === "metric_grid") {
          return (
            <div key={idx} className={sectionClass}>
              {block.title && (
                <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                  {block.title}
                </div>
              )}
              <div className={cn("grid gap-x-4 gap-y-2", block.metrics.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                {block.metrics.map((metric, i) => (
                  <div key={`${metric.label}-${i}`} className="min-w-0">
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground/90">
                      {metric.label}
                    </div>
                    <div
                      className={cn(
                        "text-[11px] font-semibold truncate mt-0.5",
                        DETAIL_TONE_CLASS[metric.tone ?? "default"]
                      )}
                      title={metric.value}
                    >
                      {metric.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (block.type === "distribution_bars") {
          if (block.scoreStrip) {
            const total = block.bins.reduce((sum, bin) => sum + bin.value, 0);
            const max = Math.max(...block.bins.map((bin) => bin.value), 1);
            const meanPct =
              block.mean != null && Number.isFinite(block.mean)
                ? Math.max(0, Math.min(100, block.mean * 100))
                : undefined;
            const scorePalette = [
              "#ef4444", // red
              "#f97316", // orange
              "#eab308", // yellow
              "#84cc16", // lime
              "#10b981", // emerald
            ];

            return (
              <div key={idx} className={sectionClass}>
                <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                  {block.title}
                </div>

                <div className="space-y-1">
                  <div className="relative flex items-end h-9 gap-px rounded-md overflow-hidden bg-zinc-800/20 border border-border/40">
                    {block.bins.map((bin, i) => {
                      const heightPct = bin.value === 0 ? 0 : Math.max(15, (bin.value / max) * 100);
                      return (
                        <div key={`${bin.label}-${i}`} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
                          <div
                            className="w-full rounded-t-sm relative"
                            style={{
                              height: `${heightPct}%`,
                              backgroundColor: scorePalette[i % scorePalette.length],
                              opacity: bin.value === 0 ? 0.12 : 0.88,
                            }}
                            title={`${bin.label}: ${bin.value}${total > 0 ? ` (${Math.round((bin.value / total) * 100)}%)` : ""}`}
                          >
                            {bin.value > 0 && (
                              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/90 drop-shadow-sm">
                                {bin.value}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {meanPct !== undefined && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-white/70"
                        style={{ left: `${meanPct}%` }}
                        title={`Mean ${Math.round((block.mean ?? 0) * 100)}%`}
                      >
                        <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[3px] border-r-[3px] border-t-[4px] border-l-transparent border-r-transparent border-t-white/80" />
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between text-[9px] text-zinc-500 font-mono px-0.5">
                    <span>0.0</span>
                    <span>0.5</span>
                    <span>1.0</span>
                  </div>

                  {block.lowToHighLabels && (
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                      <span>Low</span>
                      <span>High quality</span>
                    </div>
                  )}
                </div>

                {block.footer && (
                  <div className="mt-2 flex items-center justify-between gap-2 min-w-0">
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground shrink-0">
                      Result
                    </span>
                    <span className="text-[10px] font-semibold text-[rgb(var(--theme-500))] truncate text-right" title={block.footer}>
                      {block.footer}
                    </span>
                  </div>
                )}
              </div>
            );
          }

          const total = block.bins.reduce((sum, bin) => sum + bin.value, 0);
          const visibleBins = block.bins.slice(0, 5);
          const hiddenBins = block.bins.slice(5);
          const hiddenTotal = hiddenBins.reduce((sum, bin) => sum + bin.value, 0);
          const legendBins =
            hiddenBins.length > 0
              ? [...visibleBins.slice(0, 4), { label: `+${hiddenBins.length} more`, value: hiddenTotal }]
              : visibleBins;

          const palette = block.lowToHighLabels
            ? [
                "bg-red-500/70",
                "bg-orange-500/70",
                "bg-yellow-500/70",
                "bg-lime-500/70",
                "bg-emerald-500/70",
              ]
            : [
                "bg-slate-500/70",
                "bg-emerald-500/70",
                "bg-cyan-500/70",
                "bg-amber-500/70",
                "bg-blue-500/70",
              ];
          const dotPalette = block.lowToHighLabels
            ? [
                "bg-red-400",
                "bg-orange-400",
                "bg-yellow-400",
                "bg-lime-400",
                "bg-emerald-400",
              ]
            : [
                "bg-slate-400",
                "bg-emerald-400",
                "bg-cyan-400",
                "bg-amber-400",
                "bg-blue-400",
              ];

          return (
            <div key={idx} className={sectionClass}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                {block.title}
              </div>

              <div className="h-16 rounded-md border border-border/40 bg-background/50 p-2 flex flex-col justify-between">
                <div className="h-8 flex items-end gap-1">
                  {visibleBins.map((bin, i) => {
                    const pct = total > 0 ? (bin.value / total) * 100 : 0;
                    const height = bin.value > 0
                      ? Math.max(6, Math.round((pct / 100) * 28))
                      : 0;
                    return (
                      <div key={`${bin.label}-${i}`} className="flex-1 min-w-0 flex flex-col justify-end">
                        <div
                          className={cn("w-full rounded-sm", palette[i % palette.length])}
                          style={{ height: `${height}px` }}
                          title={`${bin.label}: ${bin.value}`}
                        />
                      </div>
                    );
                  })}
                </div>
                {block.lowToHighLabels && (
                  <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                    <span>Low</span>
                    <span>High quality</span>
                  </div>
                )}
              </div>

              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {legendBins.map((bin, i) => {
                  const pct = total > 0 ? Math.round((bin.value / total) * 100) : 0;
                  return (
                    <div key={`${bin.label}-${i}`} className="flex items-center gap-1 text-[10px]">
                      <span className={cn("w-1.5 h-1.5 rounded-sm", dotPalette[i % dotPalette.length])} />
                      <span className="text-muted-foreground truncate max-w-[92px]" title={bin.label}>
                        {bin.label}
                      </span>
                      <span className="text-foreground/80 tabular-nums">{pct}%</span>
                    </div>
                  );
                })}
              </div>

              {block.footer && (
                <div className="mt-2 flex items-center justify-between gap-2 min-w-0">
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground shrink-0">
                    Result
                  </span>
                  <span className="text-[10px] font-semibold text-[rgb(var(--theme-500))] truncate text-right" title={block.footer}>
                    {block.footer}
                  </span>
                </div>
              )}
            </div>
          );
        }

        if (block.type === "kv_list") {
          return (
            <div key={idx} className={sectionClass}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                {block.title}
              </div>
              <div className="divide-y divide-border/30">
                {block.rows.map((row, i) => (
                  <div
                    key={`${row.key}-${i}`}
                    className={cn(
                      "flex items-center justify-between gap-2",
                      i === 0 ? "pt-0 pb-1.5" : "py-1.5"
                    )}
                  >
                    <span className="text-[10px] text-muted-foreground">{row.key}</span>
                    <span className="text-[10px] font-medium text-foreground truncate text-right max-w-[65%]" title={row.value}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div
            key={idx}
            className={sectionClass}
          >
            {block.title && (
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                {block.title}
              </div>
            )}
            <div className={cn("text-xs font-medium", block.tone && DETAIL_TONE_CLASS[block.tone])}>
              {block.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// ActivityEntryRow
// =============================================================================

function ActivityEntryRow({ entry }: { entry: ActivityEntry }) {
  const isRunning = entry.status === "running";

  const StatusIcon = () => {
    if (entry.status === "completed") {
      return (
        <CheckCircle2
          className="text-green-500 shrink-0"
          style={{ width: 18, height: 18 }}
        />
      );
    }
    if (entry.status === "failed" || entry.status === "cancelled") {
      return (
        <XCircle
          className="text-destructive shrink-0"
          style={{ width: 18, height: 18 }}
        />
      );
    }
    if (entry.status === "running") {
      return (
        <Loader2
          className="animate-spin text-[rgb(var(--theme-500))] shrink-0"
          style={{ width: 18, height: 18 }}
        />
      );
    }
    if (entry.status === "skipped") {
      return (
        <SkipForward
          className="text-muted-foreground/60 shrink-0"
          style={{ width: 18, height: 18 }}
        />
      );
    }
    // pending
    return (
      <Circle
        className="text-muted-foreground shrink-0"
        style={{ width: 18, height: 18 }}
      />
    );
  };

  const TypeBadge = () => {
    if (entry.categoryBadge) {
      const badgeClassesByTone: Record<ActivityCategoryBadgeTone, string> = {
        data: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        eval: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
        finetune: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
        neutral: "bg-muted text-muted-foreground",
      };
      return (
        <span
          className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-medium",
            badgeClassesByTone[entry.categoryBadge.tone]
          )}
        >
          {entry.categoryBadge.label}
        </span>
      );
    }

    if (entry.type === "evaluation") {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
          Eval
        </span>
      );
    }
    if (entry.type === "finetune") {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400">
          Fine-tune
        </span>
      );
    }
    return null;
  };

  const StatusBadge = () => {
    const baseClasses =
      "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide";
    if (entry.status === "completed") {
      return (
        <span className={cn(baseClasses, "bg-green-500/10 text-green-700 dark:text-green-400")}>
          DONE
        </span>
      );
    }
    if (entry.status === "failed") {
      return (
        <span className={cn(baseClasses, "bg-destructive/10 text-destructive")}>
          FAILED
        </span>
      );
    }
    if (entry.status === "cancelled") {
      return (
        <span className={cn(baseClasses, "bg-destructive/10 text-destructive")}>
          CANCELLED
        </span>
      );
    }
    if (entry.status === "skipped") {
      return (
        <span className={cn(baseClasses, "bg-muted text-muted-foreground")}>
          SKIPPED
        </span>
      );
    }
    if (entry.status === "running") {
      return (
        <span
          className={cn(
            baseClasses,
            "bg-[rgb(var(--theme-500))]/10 text-[rgb(var(--theme-500))]"
          )}
        >
          RUNNING
        </span>
      );
    }
    // pending
    return (
      <span className={cn(baseClasses, "bg-muted text-muted-foreground")}>
        PENDING
      </span>
    );
  };

  const isSkippedOrPending =
    entry.status === "skipped" || entry.status === "pending";

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 transition-colors relative",
        isRunning ? "bg-[rgb(var(--theme-500))]/5" : "hover:bg-muted/30"
      )}
    >
      {/* Icon sits on the vertical line */}
      <div className="shrink-0 z-10 mt-0.5 bg-background rounded-full">
        <StatusIcon />
      </div>
      <div className="flex-1 min-w-0 pb-1">
        {/* Header: type/label on left, status/time on right */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <TypeBadge />
              <span
                className={cn(
                  "text-sm font-semibold",
                  isSkippedOrPending && "text-muted-foreground"
                )}
              >
                {entry.label}
              </span>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <StatusBadge />
            {entry.timestamp != null && (
              <span className="text-[10px] text-muted-foreground">
                {formatRelativeTime(entry.timestamp)}
              </span>
            )}
          </div>
        </div>

        {/* Primary detail */}
        {entry.detail && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {entry.detail}
          </p>
        )}

        {/* Secondary detail */}
        {entry.secondaryDetail && (
          <p
            className={cn(
              "text-xs mt-0.5",
              entry.status === "failed" || entry.status === "cancelled"
                ? "text-destructive"
                : "text-muted-foreground"
            )}
          >
            {entry.secondaryDetail}
          </p>
        )}

        {/* Progress bar (running only) */}
        {isRunning && (
          <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 bg-[rgb(var(--theme-500))]",
                entry.progress == null && "animate-pulse w-1/3"
              )}
              style={
                entry.progress != null
                  ? { width: `${entry.progress}%` }
                  : undefined
              }
            />
          </div>
        )}

        {entry.details && entry.details.length > 0 && (
          <div className="mt-2">
            <ActivityDetailBlocks blocks={entry.details} />
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// DatasetOverviewPanel
// =============================================================================

interface DatasetOverviewPanelProps {
  readme: string | null;
  readmeUpdatedAt: number | null;
  onExport: () => void;
  onRegenerate: () => Promise<void>;
  datasetId: string;
  onOverviewClick?: () => void;
}

export function DatasetOverviewPanel({
  readme,
  readmeUpdatedAt,
  onExport,
  onRegenerate,
  datasetId,
  onOverviewClick,
}: DatasetOverviewPanelProps) {
  // Dataset data for stats cards
  const { sortedRecords, dataset } = DatasetDetailConsumer();

  const insights = useMemo(
    () => computeDatasetInsights(sortedRecords),
    [sortedRecords]
  );

  const leafTopicCount = useMemo(
    () =>
      getLeafTopicsFromHierarchy(dataset?.topicHierarchy?.hierarchy).length,
    [dataset]
  );

  // Plan execution steps — from PlanContext (live) or IndexedDB fallback
  const { executionProgress, isExecuting, planStatus, proposedPlan } =
    PlanConsumer();
  const [historicalProgress, setHistoricalProgress] =
    useState<ExecutionProgress | null>(null);
  const [historicalPlanTime, setHistoricalPlanTime] = useState<number | null>(
    null
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const stored = await getStoredPlan(datasetId);
      if (!cancelled && stored?.executionProgress) {
        setHistoricalProgress(stored.executionProgress);
        setHistoricalPlanTime(stored.updatedAt);
      }
      if (!cancelled) setIsLoadingHistory(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [datasetId, planStatus]);

  const activeProgress = executionProgress ?? historicalProgress;
  const planTimestamp = isExecuting ? Date.now() : historicalPlanTime;

  // Job/activity context used by multiple timeline entry types
  const { jobs: dryRunJobs } = DryRunJobsConsumer();
  const { filteredJobs, latestJob } = FinetuneJobsConsumer();

  // Step entries
  const stepEntries: ActivityEntry[] = useMemo(
    () =>
      (activeProgress?.steps ?? [])
        .filter((s) => s.status !== "pending")
        .map((s) => ({
          id: `step-${s.id}`,
          type: "step" as ActivityEntryType,
          label: s.name,
          categoryBadge: getStepCategoryBadge(s.id),
          status: s.status as ActivityEntryStatus,
          detail: s.message ?? undefined,
          secondaryDetail: s.error ?? undefined,
          timestamp: planTimestamp ?? undefined,
          progress: s.progress,
          details: getStepDetails({
            stepId: s.id,
            stepResult: s.result,
            plan: proposedPlan,
            dataset: (dataset as Dataset | null | undefined) ?? null,
            dryRunJobs,
            finetuneJobs: filteredJobs,
          }),
        })),
    [activeProgress, planTimestamp, proposedPlan, dataset, dryRunJobs, filteredJobs]
  );

  // Dry run evaluations
  const evalEntries: ActivityEntry[] = useMemo(
    () =>
      dryRunJobs
        .filter((j) => j.status !== "pending")
        .map((j) => {
          const completedRows = getJobCompletedRows(j);
          const totalRows = getJobTotalRows(j);
          const evalStatus: ActivityEntryStatus =
            j.status === "cancelled"
              ? "cancelled"
              : j.status === "running"
              ? "running"
              : j.status === "failed"
              ? "failed"
              : "completed";
          return {
            id: `eval-${j.id}`,
            type: "evaluation" as ActivityEntryType,
            label: "Evaluation Run",
            status: evalStatus,
            detail:
              j.result?.statistics.mean != null
                ? `${Math.round(j.result.statistics.mean * 100)}% avg score · ${j.sampleSize} samples`
                : `${j.sampleSize} samples`,
            secondaryDetail: j.rolloutModel
              ? `Model: ${j.rolloutModel}`
              : undefined,
            timestamp: j.completedAt ?? j.createdAt,
            progress:
              j.status === "running" && totalRows > 0
                ? Math.round((completedRows / totalRows) * 100)
                : undefined,
            details: getEvaluationDetails(j, dataset?.dryRunStats),
          };
        }),
    [dryRunJobs, dataset?.dryRunStats]
  );

  // Finetune jobs
  const finetuneEntries: ActivityEntry[] = useMemo(
    () =>
      filteredJobs.map((j) => {
        const ftStatus: ActivityEntryStatus =
          j.status === "succeeded" ? "completed" : (j.status as ActivityEntryStatus);
        return {
          id: `ft-${j.id}`,
          type: "finetune" as ActivityEntryType,
          label: `Fine-tune · ${j.provider}`,
          status: ftStatus,
          detail: j.fine_tuned_model ?? j.base_model,
          secondaryDetail: j.error_message ?? undefined,
          timestamp: j.completed_at
            ? new Date(j.completed_at).getTime()
            : new Date(j.created_at).getTime(),
          details: getFinetuneDetails(j),
        };
      }),
    [filteredJobs]
  );

  // Merge and sort chronologically: oldest first for easier timeline scanning.
  const allEntries: ActivityEntry[] = useMemo(
    () =>
      [...stepEntries, ...evalEntries, ...finetuneEntries].sort((a, b) => {
        const aTime = a.timestamp ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.timestamp ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      }),
    [stepEntries, evalEntries, finetuneEntries]
  );

  // Eval health card data
  const completedJobsWithScore = useMemo(
    () => dryRunJobs.filter((j) => j.status === "completed" && getJobAverageScore(j) != null),
    [dryRunJobs]
  );
  const evalCurrentScore = completedJobsWithScore[0]
    ? getJobAverageScore(completedJobsWithScore[0])
    : undefined;
  const evalPrevScore = completedJobsWithScore[1]
    ? getJobAverageScore(completedJobsWithScore[1])
    : undefined;
  const criteriaCount = proposedPlan?.grader_config?.criteria?.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 4-col stat grid: overview card spans 2, eval + finetune take 1 each */}
      <div className="grid grid-cols-4 gap-3 px-4 py-3 shrink-0 border-b border-border">
        <div className="col-span-2 h-full">
          <DatasetOverviewCard
            total={insights.totalRecords}
            original={insights.originalRecords}
            generated={insights.generatedRecords}
            topicDistribution={insights.topicDistribution}
            uncategorizedCount={insights.uncategorizedCount}
            balanceRating={dataset?.coverageStats?.balanceRating}
            balanceScore={dataset?.coverageStats?.balanceScore}
            leafTopicCount={leafTopicCount}
            onClick={onOverviewClick}
            compact
          />
        </div>
        <EvalHealthCard
          currentScore={evalCurrentScore}
          prevScore={evalPrevScore}
          criteriaCount={criteriaCount}
          onClick={() => emitter.emit("vllora_switch_tab", { datasetId, tab: "evaluator" })}
        />
        <FinetuneStatusCard latestJob={latestJob} />
      </div>

      {/* Dual pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left 60%: README */}
        <div className="w-[60%] border-r border-border flex flex-col overflow-hidden">
          <DatasetReadmeViewer
            readme={readme}
            readmeUpdatedAt={readmeUpdatedAt}
            onExport={onExport}
            onRegenerate={onRegenerate}
            className="h-full"
          />
        </div>

        {/* Right 40%: Activity Timeline */}
        <div className="w-[40%] flex flex-col overflow-hidden">
          <ActivityTimeline
            entries={allEntries}
            isLoading={isLoadingHistory && !executionProgress}
            isLive={isExecuting}
          />
        </div>
      </div>
    </div>
  );
}
