import { useMemo } from "react";
import {
  Target,
  GitBranch,
  Database,
  FlaskConical,
  TrendingUp,
  ArrowRight,
  Sparkles,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Dataset, DatasetRecord, TopicHierarchyNode, DryRunStats, ScoreDistribution } from "@/types/dataset-types";
import type { DryRunJob } from "@/types/dry-run-job";
import { getJobAverageScore, getJobCompletedRows, getJobTotalRows } from "@/types/dry-run-job";
import type { FinetuneJob } from "@/services/finetune-api";
import type { Plan } from "@/lib/distri-finetune-tools/steps/propose-plan/types";
import { getLeafTopicsFromHierarchy } from "@/components/datasets/record-utils";

interface StructuredOverviewPaneProps {
  dataset: Dataset | null | undefined;
  records: DatasetRecord[];
  dryRunJobs: DryRunJob[];
  latestFinetuneJob: FinetuneJob | null;
  finetuneJobsCount: number;
  proposedPlan: Plan | null;
  onOpenRecords: () => void;
  onOpenEvaluator: () => void;
  onOpenJobs: () => void;
  onOpenRecord: (recordId: string) => void;
  onOpenDryRunJob?: (jobId: string) => void;
  onOpenFinetuneJob?: (jobId: string) => void;
  className?: string;
}

type ScoreBin = { key: keyof ScoreDistribution; label: string; count: number; color: string };

const SCORE_BINS: Array<{ key: keyof ScoreDistribution; label: string; color: string }> = [
  { key: "0.0-0.2", label: "0-0.2", color: "#ef4444" },
  { key: "0.2-0.4", label: "0.2-0.4", color: "#f97316" },
  { key: "0.4-0.6", label: "0.4-0.6", color: "#eab308" },
  { key: "0.6-0.8", label: "0.6-0.8", color: "#84cc16" },
  { key: "0.8-1.0", label: "0.8-1.0", color: "#10b981" },
];

function formatTimestamp(ts?: number | null): string | null {
  if (!ts) return null;
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(ts?: number | null): string | null {
  if (!ts) return null;
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function truncateText(text: string, max = 180): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function extractTextContent(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractTextContent(item));
  }
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec.text === "string") return [rec.text];
    if (typeof rec.content === "string") return [rec.content];
    if (Array.isArray(rec.content)) return extractTextContent(rec.content);
  }
  return [];
}

function getRecordPreview(record: DatasetRecord): string {
  const data = (record.data ?? {}) as Record<string, unknown>;

  const topLevelMessages = Array.isArray(data.messages) ? (data.messages as Array<Record<string, unknown>>) : [];
  const input = (data.input as Record<string, unknown> | undefined) ?? undefined;
  const output = (data.output as Record<string, unknown> | undefined) ?? undefined;
  const inputMessages = Array.isArray(input?.messages) ? (input?.messages as Array<Record<string, unknown>>) : [];
  const outputMessagesRaw = output?.messages;
  const outputMessages = Array.isArray(outputMessagesRaw)
    ? (outputMessagesRaw as Array<Record<string, unknown>>)
    : outputMessagesRaw && typeof outputMessagesRaw === "object"
    ? [outputMessagesRaw as Record<string, unknown>]
    : [];

  const allMessages = [...topLevelMessages, ...inputMessages, ...outputMessages];
  const preferred =
    allMessages.find((m) => m?.role === "user") ??
    allMessages.find((m) => m?.role === "assistant") ??
    allMessages[0];

  if (preferred) {
    const texts = extractTextContent(preferred.content);
    if (texts.length > 0) return truncateText(texts.join(" "));
  }

  try {
    return truncateText(JSON.stringify(record.data));
  } catch {
    return "No preview available";
  }
}

function buildTopicPathMap(nodes?: TopicHierarchyNode[], parentPath: string[] = [], map = new Map<string, string>()) {
  if (!nodes?.length) return map;
  for (const node of nodes) {
    const path = [...parentPath, node.name];
    const pathStr = path.join(" / ");
    if (node.id) map.set(node.id, pathStr);
    map.set(node.name, map.get(node.name) ?? pathStr);
    map.set(path.join("/"), pathStr);
    buildTopicPathMap(node.children, path, map);
  }
  return map;
}

function pickSampleRecords(records: DatasetRecord[]): DatasetRecord[] {
  if (records.length <= 5) return records.slice(0, 5);
  const selected: DatasetRecord[] = [];
  const seen = new Set<string>();
  const push = (r?: DatasetRecord) => {
    if (!r || seen.has(r.id)) return;
    selected.push(r);
    seen.add(r.id);
  };

  const withScore = records.find((r) => r.evaluation?.dryRunScore != null || r.evaluation?.score != null);
  const generated = records.find((r) => r.is_generated);
  const original = records.find((r) => !r.is_generated);
  push(withScore);
  push(generated);
  push(original);

  for (const r of records) {
    push(r);
    if (selected.length >= 5) break;
  }

  return selected.slice(0, 5);
}

function getDryRunStatusPill(status: DryRunJob["status"]) {
  switch (status) {
    case "completed":
      return "bg-emerald-500/15 text-emerald-400";
    case "running":
      return "bg-blue-500/15 text-blue-400";
    case "failed":
      return "bg-red-500/15 text-red-400";
    case "cancelled":
      return "bg-zinc-500/15 text-zinc-400";
    default:
      return "bg-zinc-500/15 text-zinc-400";
  }
}

function getFinetuneStatusPill(status?: string | null) {
  switch (status) {
    case "succeeded":
      return "bg-emerald-500/15 text-emerald-400";
    case "running":
      return "bg-blue-500/15 text-blue-400";
    case "pending":
      return "bg-zinc-500/15 text-zinc-300";
    case "failed":
      return "bg-red-500/15 text-red-400";
    case "cancelled":
      return "bg-zinc-500/15 text-zinc-400";
    default:
      return "bg-zinc-500/15 text-zinc-400";
  }
}

function verdictUi(verdict?: DryRunStats["diagnosis"]["verdict"]) {
  if (verdict === "GO") {
    return { label: "GO", Icon: CheckCircle2, className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
  }
  if (verdict === "WARNING") {
    return { label: "Warning", Icon: AlertTriangle, className: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
  }
  if (verdict === "NO-GO") {
    return { label: "No-Go", Icon: XCircle, className: "text-red-400 bg-red-500/10 border-red-500/20" };
  }
  return null;
}

function countNodeRecords(
  node: TopicHierarchyNode,
  path: string[],
  topicCounts: Map<string, number>
): number {
  const pathKey = path.join("/");
  const direct = topicCounts.get(pathKey) ?? topicCounts.get(node.id || "") ?? topicCounts.get(node.name) ?? 0;
  if (!node.children?.length) return direct;
  const childSum = node.children.reduce((sum, child) => sum + countNodeRecords(child, [...path, child.name], topicCounts), 0);
  return Math.max(direct, childSum);
}

function topicCountsMapFromDataset(dataset: Dataset | null | undefined, records: DatasetRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  if (dataset?.coverageStats?.topicDistribution) {
    for (const [key, count] of Object.entries(dataset.coverageStats.topicDistribution)) {
      map.set(key, count);
    }
    return map;
  }
  for (const record of records) {
    const key = record.topic || "__unassigned__";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function ScoreDistributionMini({ stats }: { stats: DryRunStats }) {
  const bins = useMemo<ScoreBin[]>(
    () =>
      SCORE_BINS.map((b) => ({
        ...b,
        count: stats.distribution?.[b.key] ?? 0,
      })),
    [stats]
  );
  const total = bins.reduce((sum, b) => sum + b.count, 0);
  const max = Math.max(...bins.map((b) => b.count), 1);

  return (
    <div className="rounded-lg border border-border/40 bg-background/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Score Distribution</span>
        <span className="text-[10px] text-muted-foreground">{stats.samplesEvaluated} samples</span>
      </div>
      <div className="flex items-start gap-1">
        {bins.map((bin) => {
          const h = bin.count > 0 ? Math.max(4, Math.round((bin.count / max) * 48)) : 2;
          const pct = total > 0 ? Math.round((bin.count / total) * 100) : 0;
          return (
            <div key={bin.key} className="flex-1 min-w-0">
              <div className="flex items-end h-12">
                <div
                  className="w-full rounded-t-sm"
                  style={{ height: `${h}px`, backgroundColor: bin.count > 0 ? bin.color : "rgba(113,113,122,0.25)" }}
                  title={`${bin.label}: ${bin.count} (${pct}%)`}
                />
              </div>
              <div className="mt-1 text-[8px] text-center text-muted-foreground truncate">
                {bin.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  right,
  children,
}: {
  title: string;
  icon: React.ElementType;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-2">
        <div className="min-w-0 flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-[rgb(var(--theme-500))]" />
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        </div>
        {right ? <div className="min-w-0 flex items-center gap-2">{right}</div> : null}
      </div>
      <div className="mt-6 border-b border-border/40" />
      <div className="pt-2">{children}</div>
    </section>
  );
}

function TopicTree({
  nodes,
  topicCounts,
  rootLabel,
}: {
  nodes: TopicHierarchyNode[];
  topicCounts: Map<string, number>;
  rootLabel: string;
}) {
  const renderNodes = (items: TopicHierarchyNode[], parentPath: string[] = [], depth = 0): React.ReactNode => {
    return items.map((node) => {
      const path = [...parentPath, node.name];
      const count = countNodeRecords(node, path, topicCounts);
      const isLeaf = !node.children?.length;
      return (
        <div key={`${node.id ?? node.name}-${path.join("/")}`} className="space-y-1">
          <div
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1 bg-background/20"
            style={{ marginLeft: depth * 14 }}
          >
            <div className="min-w-0 flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-sm", isLeaf ? "bg-cyan-400/70" : "bg-[rgb(var(--theme-500))]/70")} />
              <span className={cn("text-xs truncate", isLeaf ? "text-foreground/90" : "font-medium")}>
                {node.name}
              </span>
            </div>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded tabular-nums",
              count > 0 ? "bg-emerald-500/15 text-emerald-400" : "text-muted-foreground"
            )}>
              {count}
            </span>
          </div>
          {node.children?.length ? renderNodes(node.children, path, depth + 1) : null}
        </div>
      );
    });
  };

  return (
    <div className="rounded-lg border border-border/40 bg-background/20 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium">
        <Sparkles className="w-3.5 h-3.5 text-[rgb(var(--theme-500))]" />
        <span className="truncate">{rootLabel}</span>
      </div>
      <div className="space-y-1">{renderNodes(nodes)}</div>
    </div>
  );
}

export function StructuredOverviewPane({
  dataset,
  records,
  dryRunJobs,
  latestFinetuneJob,
  finetuneJobsCount,
  proposedPlan,
  onOpenRecords,
  onOpenEvaluator,
  onOpenJobs,
  onOpenRecord,
  onOpenDryRunJob,
  onOpenFinetuneJob,
  className,
}: StructuredOverviewPaneProps) {
  const leafTopics = useMemo(
    () => getLeafTopicsFromHierarchy(dataset?.topicHierarchy?.hierarchy),
    [dataset?.topicHierarchy?.hierarchy]
  );
  const topicPathMap = useMemo(
    () => buildTopicPathMap(dataset?.topicHierarchy?.hierarchy),
    [dataset?.topicHierarchy?.hierarchy]
  );
  const topicCounts = useMemo(
    () => topicCountsMapFromDataset(dataset, records),
    [dataset, records]
  );

  const sampleRecords = useMemo(() => pickSampleRecords(records), [records]);

  const generatedCount = useMemo(
    () => records.filter((r) => r.is_generated).length,
    [records]
  );
  const originalCount = records.length - generatedCount;

  const runningDryRunJob = useMemo(
    () => dryRunJobs.find((j) => j.status === "running" || j.status === "pending") ?? null,
    [dryRunJobs]
  );
  const latestDryRunJob = useMemo(
    () =>
      [...dryRunJobs]
        .sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt))[0] ?? null,
    [dryRunJobs]
  );
  const completedDryRunJob = useMemo(
    () =>
      [...dryRunJobs]
        .filter((j) => j.status === "completed" && j.result)
        .sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt))[0] ?? null,
    [dryRunJobs]
  );
  const effectiveDryRunStats = completedDryRunJob?.result ?? dataset?.dryRunStats ?? null;

  const qualityVerdict = verdictUi(effectiveDryRunStats?.diagnosis?.verdict);

  const latestFinetuneTime = latestFinetuneJob
    ? new Date(latestFinetuneJob.completed_at ?? latestFinetuneJob.created_at).getTime()
    : null;

  const objectiveText = dataset?.datasetObjective?.trim() || "No training objective defined yet.";
  const rootTopicLabel = dataset?.datasetObjective?.trim()
    ? truncateText(dataset.datasetObjective.trim(), 42)
    : dataset?.name ?? "Dataset";
  const topicLastUpdated = dataset?.coverageStats?.lastCalculatedAt ?? dataset?.topicHierarchy?.generatedAt ?? null;

  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <SectionCard
          title="Project Objective"
          icon={Target}
          right={
            proposedPlan ? (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                {proposedPlan.estimated_records ? (
                  <span className="px-1.5 py-0.5 rounded-full bg-background/60">
                    target {proposedPlan.estimated_records}
                  </span>
                ) : null}
                {proposedPlan.grader_config?.criteria?.length ? (
                  <span className="px-1.5 py-0.5 rounded-full bg-background/60">
                    {proposedPlan.grader_config.criteria.length} criteria
                  </span>
                ) : null}
              </div>
            ) : undefined
          }
        >
          <p className="text-sm leading-relaxed text-foreground/90">
            {objectiveText}
          </p>
        </SectionCard>

        <SectionCard
          title="Dataset Snapshot"
          icon={Database}
          right={
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs gap-1.5 border-border/50 bg-background/20 text-muted-foreground hover:bg-background/35 hover:text-foreground"
              onClick={onOpenRecords}
            >
              Records
              <ArrowRight className="w-3 h-3" />
            </Button>
          }
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-3">
            <MetricItem label="Total Records" value={`${records.length}`} />
            <MetricItem label="Generated" value={`${generatedCount}`} />
            <MetricItem label="Original" value={`${originalCount}`} />
            <MetricItem label="Leaf Topics" value={`${leafTopics.length}`} />
            <MetricItem label="Unassigned" value={`${dataset?.coverageStats?.uncategorizedCount ?? dataset?.stats?.uncategorizedCount ?? 0}`} />
            <MetricItem
              label="Balance"
              value={
                dataset?.coverageStats?.balanceScore != null
                  ? `${dataset.coverageStats.balanceScore.toFixed(2)}`
                  : "N/A"
              }
            />
            <MetricItem
              label="Evaluation Avg"
              value={
                effectiveDryRunStats?.statistics?.mean != null
                  ? effectiveDryRunStats.statistics.mean.toFixed(2)
                  : "N/A"
              }
            />
            <MetricItem
              label="Finetune"
              value={latestFinetuneJob ? latestFinetuneJob.status : "No job"}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Topic Hierarchy"
          icon={GitBranch}
          right={
            <div className="flex items-center gap-2">
              {topicLastUpdated ? (
                <span className="text-[10px] text-muted-foreground">
                  Updated {formatRelativeTime(topicLastUpdated)}
                </span>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs gap-1.5 border-border/50 bg-background/20 text-muted-foreground hover:bg-background/35 hover:text-foreground"
                onClick={onOpenRecords}
              >
                Open Records
                <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          }
        >
          {dataset?.topicHierarchy?.hierarchy?.length ? (
            <div className="space-y-3">
              <TopicTree
                nodes={dataset.topicHierarchy.hierarchy}
                topicCounts={topicCounts}
                rootLabel={rootTopicLabel}
              />
              <div className="grid grid-cols-3 gap-x-4 gap-y-2 pt-1 border-t border-border/30">
                <MetricItem label="Total Topics" value={`${countAllTopics(dataset.topicHierarchy.hierarchy)}`} />
                <MetricItem label="Leaf Topics" value={`${leafTopics.length}`} />
                <MetricItem
                  label="Assigned Records"
                  value={`${Math.max(0, records.length - (dataset.coverageStats?.uncategorizedCount ?? 0))}`}
                />
              </div>
            </div>
          ) : (
            <EmptySection
              text="No topic hierarchy configured yet."
              actionLabel="Go to Records"
              onAction={onOpenRecords}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Quality & Evaluation"
          icon={FlaskConical}
          right={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs gap-1.5 border-border/50 bg-background/20 text-muted-foreground hover:bg-background/35 hover:text-foreground"
                onClick={onOpenEvaluator}
              >
                Evaluator
                <ArrowRight className="w-3 h-3" />
              </Button>
              {latestDryRunJob && onOpenDryRunJob ? (
                <button
                  type="button"
                  onClick={() => onOpenDryRunJob(latestDryRunJob.id)}
                  className="w-7 h-7 rounded-full border border-border/40 bg-background/50 text-muted-foreground hover:text-foreground hover:border-[rgb(var(--theme-500))]/40 transition-colors flex items-center justify-center"
                  title="Open latest evaluation job"
                >
                  <ArrowRight className="w-3 h-3" />
                </button>
              ) : null}
            </div>
          }
        >
          {runningDryRunJob && (
            <div className="mb-3 rounded-lg border border-blue-500/15 bg-blue-500/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", getDryRunStatusPill(runningDryRunJob.status))}>
                    {runningDryRunJob.status.toUpperCase()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {getJobCompletedRows(runningDryRunJob)}/{getJobTotalRows(runningDryRunJob) || runningDryRunJob.sampleSize} rows
                  </span>
                </div>
                {getJobAverageScore(runningDryRunJob) != null && (
                  <span className="text-xs font-medium text-blue-400">
                    avg {getJobAverageScore(runningDryRunJob)?.toFixed(2)}
                  </span>
                )}
              </div>
              {getJobTotalRows(runningDryRunJob) > 0 && (
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{
                      width: `${Math.round((getJobCompletedRows(runningDryRunJob) / Math.max(1, getJobTotalRows(runningDryRunJob))) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {effectiveDryRunStats ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {qualityVerdict ? (
                  <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium", qualityVerdict.className)}>
                    <qualityVerdict.Icon className="w-3.5 h-3.5" />
                    {qualityVerdict.label}
                  </span>
                ) : null}
                <MetricPill label="Avg" value={effectiveDryRunStats.statistics.mean.toFixed(2)} />
                <MetricPill label="Std" value={effectiveDryRunStats.statistics.std.toFixed(2)} />
                <MetricPill label="Samples" value={`${effectiveDryRunStats.samplesEvaluated}`} />
                {effectiveDryRunStats.lastRunAt ? (
                  <span className="text-[10px] text-muted-foreground">
                    Last run {formatRelativeTime(effectiveDryRunStats.lastRunAt)}
                  </span>
                ) : null}
              </div>

              <ScoreDistributionMini stats={effectiveDryRunStats} />

              {effectiveDryRunStats.diagnosis?.recommendations?.length ? (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Recommendations</div>
                  <div className="flex flex-wrap gap-1.5">
                    {effectiveDryRunStats.diagnosis.recommendations.slice(0, 4).map((rec, i) => (
                      <span key={`${rec}-${i}`} className="px-2 py-0.5 rounded-full bg-background/60 text-xs text-foreground/90 max-w-full truncate" title={rec}>
                        {rec}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptySection
              text="No evaluation results yet. Run an evaluation to see quality signals and score distribution."
              actionLabel="Open Evaluator"
              onAction={onOpenEvaluator}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Sample Records"
          icon={BookOpen}
          right={
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs gap-1.5 border-border/50 bg-background/20 text-muted-foreground hover:bg-background/35 hover:text-foreground"
              onClick={onOpenRecords}
            >
              View All
              <ArrowRight className="w-3 h-3" />
            </Button>
          }
        >
          {sampleRecords.length > 0 ? (
            <div className="space-y-2.5">
              {sampleRecords.map((record, index) => {
                const score = record.evaluation?.dryRunScore ?? record.evaluation?.score;
                const topicLabel = record.topic ? (topicPathMap.get(record.topic) ?? record.topic) : "Unassigned";
                return (
                  <div key={record.id} className="rounded-lg border border-border/40 bg-background/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-[rgb(var(--theme-500))]/10 text-[rgb(var(--theme-500))] text-[10px] font-medium">
                            Example {index + 1}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-background/60 text-[10px] text-muted-foreground truncate max-w-[200px]" title={topicLabel}>
                            {topicLabel}
                          </span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[10px]",
                            record.is_generated ? "bg-cyan-500/10 text-cyan-400" : "bg-zinc-500/10 text-zinc-400"
                          )}>
                            {record.is_generated ? "Generated" : "Original"}
                          </span>
                          {score != null && (
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-medium",
                              score >= 0.7 ? "bg-emerald-500/10 text-emerald-400" :
                              score >= 0.4 ? "bg-amber-500/10 text-amber-400" :
                              "bg-red-500/10 text-red-400"
                            )}>
                              score {score.toFixed(2)}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-foreground/90">
                          {getRecordPreview(record)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenRecord(record.id)}
                        title="Open record"
                        className="w-7 h-7 rounded-full border border-border/40 bg-background/50 text-muted-foreground hover:text-foreground hover:border-[rgb(var(--theme-500))]/40 transition-colors flex items-center justify-center shrink-0"
                      >
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptySection
              text="No records yet. Generate or import data to preview representative samples here."
              actionLabel="Open Records"
              onAction={onOpenRecords}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Fine-tune Snapshot"
          icon={TrendingUp}
          right={
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs gap-1.5 border-border/50 bg-background/20 text-muted-foreground hover:bg-background/35 hover:text-foreground"
              onClick={onOpenJobs}
            >
              Jobs
              <ArrowRight className="w-3 h-3" />
            </Button>
          }
        >
          {latestFinetuneJob ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", getFinetuneStatusPill(latestFinetuneJob.status))}>
                      {latestFinetuneJob.status.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {finetuneJobsCount} job{finetuneJobsCount === 1 ? "" : "s"}
                    </span>
                    {latestFinetuneTime ? (
                      <span className="text-[10px] text-muted-foreground">
                        {formatRelativeTime(latestFinetuneTime)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm font-medium truncate" title={latestFinetuneJob.fine_tuned_model ?? latestFinetuneJob.base_model}>
                    {latestFinetuneJob.fine_tuned_model ?? latestFinetuneJob.base_model}
                  </div>
                  <div className="text-xs text-muted-foreground truncate" title={latestFinetuneJob.base_model}>
                    Base: {latestFinetuneJob.base_model}
                  </div>
                </div>
                {onOpenFinetuneJob ? (
                  <button
                    type="button"
                    onClick={() => onOpenFinetuneJob(latestFinetuneJob.id)}
                    title="Open latest fine-tune job"
                    className="w-8 h-8 rounded-full border border-border/40 bg-background/50 text-muted-foreground hover:text-foreground hover:border-[rgb(var(--theme-500))]/40 transition-colors flex items-center justify-center shrink-0"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <MetricItem label="Provider" value={latestFinetuneJob.provider} />
                <MetricItem label="Created" value={formatTimestamp(new Date(latestFinetuneJob.created_at).getTime()) ?? "—"} />
                {latestFinetuneJob.training_config?.epochs != null && (
                  <MetricItem label="Epochs" value={`${latestFinetuneJob.training_config.epochs}`} />
                )}
                {latestFinetuneJob.training_config?.learning_rate != null && (
                  <MetricItem label="Learning Rate" value={`${latestFinetuneJob.training_config.learning_rate}`} />
                )}
              </div>

              {latestFinetuneJob.error_message ? (
                <p className="text-xs text-destructive leading-relaxed">
                  {truncateText(latestFinetuneJob.error_message, 220)}
                </p>
              ) : null}
            </div>
          ) : (
            <EmptySection
              text="No fine-tune jobs yet. Once training starts, the latest job status and model details will appear here."
              actionLabel="Open Jobs"
              onAction={onOpenJobs}
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold truncate" title={value}>
        {value}
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-background/60 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

function EmptySection({
  text,
  actionLabel,
  onAction,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border/40 bg-background/15 p-4 flex items-start justify-between gap-3">
      <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
      {actionLabel && onAction ? (
        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function countAllTopics(nodes: TopicHierarchyNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (node.children?.length) count += countAllTopics(node.children);
  }
  return count;
}
