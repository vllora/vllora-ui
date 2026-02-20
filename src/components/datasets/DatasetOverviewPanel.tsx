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
import { getJobCompletedRows, getJobTotalRows, getJobAverageScore } from "@/types/dry-run-job";
import { emitter } from "@/utils/eventEmitter";
import type { ExecutionProgress } from "@/lib/distri-finetune-tools/steps/execute-plan";
import type { Plan } from "@/lib/distri-finetune-tools/steps/propose-plan/types";
import type { FinetuneJob } from "@/services/finetune-api";

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

interface ActivityEntry {
  id: string;
  type: ActivityEntryType;
  label: string;
  status: ActivityEntryStatus;
  detail?: string;
  secondaryDetail?: string;
  timestamp?: number;
  progress?: number;
  chips?: {
    header: string;
    items: string[];
  };
}

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

function getStepChips(
  stepId: string,
  stepResult: unknown,
  plan: Plan | null
): ActivityEntry["chips"] | undefined {
  const r = stepResult as Record<string, unknown> | null;

  if (stepId === "topics") {
    const names = plan?.proposed_topics?.map((t) => t.name) ?? [];
    return names.length ? { header: "TOP GENERATED TOPICS", items: names } : undefined;
  }
  if (stepId === "adjust_topics") {
    const changes = (r?.changes_made as string[]) ?? [];
    return changes.length ? { header: "CHANGES MADE", items: changes } : undefined;
  }
  if (stepId === "grader") {
    const criteria = plan?.grader_config?.criteria?.map((c) => c.name) ?? [];
    return criteria.length ? { header: "EVALUATION CRITERIA", items: criteria } : undefined;
  }
  if (stepId === "categorize") {
    const count = (r as Record<string, unknown> | null)?.categorization
      ? ((r as Record<string, unknown>).categorization as Record<string, unknown>)?.assigned_count
      : undefined;
    return count != null
      ? { header: "RESULT", items: [`${count} records assigned to topics`] }
      : undefined;
  }
  if (stepId === "generate") {
    const count = (r as Record<string, unknown> | null)?.records_created;
    return count != null
      ? { header: "RESULT", items: [`${count} training examples created`] }
      : undefined;
  }
  return undefined;
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
        {/* Type badge + label */}
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

        {/* Status badge + timestamp */}
        <div className="flex items-center gap-2 mt-1">
          <StatusBadge />
          {entry.timestamp != null && (
            <span className="text-[10px] text-muted-foreground">
              {formatRelativeTime(entry.timestamp)}
            </span>
          )}
        </div>

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

        {/* Chips sub-card */}
        {entry.chips && (
          <div className="mt-2 rounded-md border border-border bg-muted/40 p-2.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
              {entry.chips.header}
            </div>
            <div className="flex flex-wrap gap-1">
              {entry.chips.items.map((item, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded border border-border bg-background text-xs text-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
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

  // Step entries
  const stepEntries: ActivityEntry[] = useMemo(
    () =>
      (activeProgress?.steps ?? [])
        .filter((s) => s.status !== "pending")
        .map((s) => ({
          id: `step-${s.id}`,
          type: "step" as ActivityEntryType,
          label: s.name,
          status: s.status as ActivityEntryStatus,
          detail: s.message ?? undefined,
          secondaryDetail: s.error ?? undefined,
          timestamp: planTimestamp ?? undefined,
          progress: s.progress,
          chips: getStepChips(s.id, s.result, proposedPlan),
        })),
    [activeProgress, planTimestamp, proposedPlan]
  );

  // Dry run evaluations
  const { jobs: dryRunJobs } = DryRunJobsConsumer();
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
          };
        }),
    [dryRunJobs]
  );

  // Finetune jobs
  const { filteredJobs, latestJob } = FinetuneJobsConsumer();
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
        };
      }),
    [filteredJobs]
  );

  // Merge and sort: running first, then by timestamp descending
  const allEntries: ActivityEntry[] = useMemo(
    () =>
      [...stepEntries, ...evalEntries, ...finetuneEntries].sort((a, b) => {
        const aRunning = a.status === "running" ? 1 : 0;
        const bRunning = b.status === "running" ? 1 : 0;
        if (aRunning !== bRunning) return bRunning - aRunning;
        return (b.timestamp ?? 0) - (a.timestamp ?? 0);
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
