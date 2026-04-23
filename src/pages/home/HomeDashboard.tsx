/**
 * HomeDashboard
 *
 * Populated homepage — renders when at least one workflow exists. Mirrors
 * the "workflows" populated surface from the design mock: greeting + main
 * 2-column grid (workflow cards | activity feed). Data is derived from the
 * workflow-list response (no extra fetches, no synthesized metrics). Quick-
 * stats tiles the mock shows for gateway traffic / GPU hours are omitted
 * because we don't store them at the list level — we only surface what's
 * real.
 */

import { useMemo } from "react";
import { useNavigate } from "react-router";
import {
  Plus,
  Search,
  Bell,
  AlertTriangle,
  CheckCircle2,
  Upload,
  BarChart3,
  GraduationCap,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Dataset } from "@/types/dataset-types";

interface HomeDashboardProps {
  readonly datasets: readonly Dataset[];
  readonly projectName?: string | null;
}

interface WorkflowCardRow {
  readonly dataset: Dataset;
  readonly status: CardStatus;
  readonly records: number;
  readonly sources: number;
  readonly runningJobs: number;
  readonly attention: readonly string[];
  readonly lastRun: string;
}

interface ActivityEntry {
  readonly id: string;
  readonly workflow: string;
  readonly workflowId: string;
  readonly kind: "eval" | "train";
  readonly status: string;
  readonly model?: string;
  readonly timestamp: number;
}

type CardStatus = "healthy" | "training" | "attention" | "draft" | "stale";

// ─── Public component ───────────────────────────────────────────────────────

export function HomeDashboard({ datasets, projectName }: HomeDashboardProps) {
  const navigate = useNavigate();
  const rows = useMemo(() => datasets.map(buildRow), [datasets]);
  const attentionCount = rows.reduce((n, r) => n + r.attention.length, 0);
  const runningCount = rows.reduce((n, r) => n + r.runningJobs, 0);
  const totalRecords = rows.reduce((n, r) => n + r.records, 0);
  const evalRunsCount = datasets.reduce((n, d) => n + (d.evalJobs?.length ?? 0), 0);
  const trainingCount = datasets.reduce((n, d) => n + (d.trainingJobs?.length ?? 0), 0);
  const activity = useMemo(() => buildActivityFeed(datasets), [datasets]);

  return (
    <div
      className="mx-auto flex w-full max-w-[1200px] flex-col px-6"
      style={{
        paddingTop: "clamp(0.75rem, 2.5vh, 1.75rem)",
        paddingBottom: "clamp(0.75rem, 2.5vh, 1.75rem)",
        gap: "clamp(0.5rem, 1.5vh, 1.25rem)",
      }}
    >
      <GreetingHeader
        workspace={projectName ?? "vLLora"}
        workflowCount={rows.length}
        attentionCount={attentionCount}
        runningCount={runningCount}
        onNewWorkflow={() => navigate("/finetune/setup")}
      />

      {attentionCount > 0 && <AttentionStrip rows={rows} onOpen={(id) => navigate(`/finetune/${id}`)} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-3">
          <WorkflowsHeader count={rows.length} />
          <WorkflowCardsGrid rows={rows} onOpen={(id) => navigate(`/finetune/${id}`)} />
          <QuickStats totalRecords={totalRecords} evalRuns={evalRunsCount} trainingJobs={trainingCount} />
        </div>

        <ActivityFeed
          entries={activity}
          onOpen={(id) => navigate(`/finetune/${id}`)}
        />
      </div>
    </div>
  );
}

// ─── Greeting ───────────────────────────────────────────────────────────────

function GreetingHeader({
  workspace,
  workflowCount,
  attentionCount,
  runningCount,
  onNewWorkflow,
}: {
  readonly workspace: string;
  readonly workflowCount: number;
  readonly attentionCount: number;
  readonly runningCount: number;
  readonly onNewWorkflow: () => void;
}) {
  const greeting = timeOfDayGreeting();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] font-medium tracking-[0.04em] text-muted-foreground">
          Workspace · <span className="text-foreground/80">{workspace}</span>
        </div>
        <h1 className="mt-0.5 text-[24px] font-semibold tracking-[-0.015em] text-foreground">
          {greeting}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-muted-foreground">
          <span>
            <span
              className={cn(
                "font-mono font-medium tabular-nums",
                attentionCount > 0 ? "text-amber-400" : "text-emerald-300",
              )}
            >
              {attentionCount}
            </span>{" "}
            {attentionCount === 1 ? "item needs" : "items need"} your attention
          </span>
          <span>·</span>
          <span>
            <span className="font-mono font-medium tabular-nums text-amber-400">{runningCount}</span>{" "}
            {runningCount === 1 ? "job" : "jobs"} running
          </span>
          <span>·</span>
          <span>
            <span className="font-mono font-medium tabular-nums text-foreground/80">
              {workflowCount}
            </span>{" "}
            workflows
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="text"
            placeholder="Search workflows, records, traces…"
            className="h-8 w-[280px] rounded-md border border-border bg-card/60 pl-8 pr-3 text-[12px] font-[inherit] text-foreground placeholder:text-muted-foreground/60 focus:border-emerald-500/40 focus:outline-none"
          />
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
        </div>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card/40 px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          title="Notifications"
        >
          <Bell className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onNewWorkflow}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[rgb(var(--theme-500))] px-3 text-[12px] font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-all hover:bg-[rgb(var(--theme-600))]"
        >
          <Plus className="h-3.5 w-3.5" />
          New workflow
        </button>
      </div>
    </div>
  );
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good evening";
}

// ─── Attention strip ────────────────────────────────────────────────────────

function AttentionStrip({
  rows,
  onOpen,
}: {
  readonly rows: readonly WorkflowCardRow[];
  readonly onOpen: (id: string) => void;
}) {
  const items = rows.flatMap((r) =>
    r.attention.map((msg) => ({ id: r.dataset.id, name: r.dataset.name, msg, status: r.status })),
  );
  const visible = items.slice(0, 4);

  return (
    <div
      className="overflow-hidden rounded-xl border border-amber-500/20"
      style={{ background: "linear-gradient(180deg, rgba(245,158,11,0.04), transparent)" }}
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-400">
          Needs your attention
        </span>
        <span className="text-[11px] text-muted-foreground">· {items.length} items</span>
      </div>
      <div>
        {visible.map((a, i) => (
          <button
            key={`${a.id}-${i}`}
            type="button"
            onClick={() => onOpen(a.id)}
            className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-2 text-left text-[12px] transition-colors last:border-b-0 hover:bg-muted/30"
          >
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDotClass(a.status))} />
            <span className="min-w-[180px] truncate font-mono text-[11.5px] text-emerald-300">
              {a.name}
            </span>
            <span className="flex-1 truncate text-foreground/80">{a.msg}</span>
            <span className="text-[11px] text-muted-foreground/70">Open →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Workflows header ───────────────────────────────────────────────────────

function WorkflowsHeader({ count }: { readonly count: number }) {
  return (
    <div className="flex h-[37px] items-center gap-2 px-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Workflows
      </span>
      <span className="text-[11px] text-muted-foreground/60">· {count}</span>
    </div>
  );
}

// ─── Workflow card grid ─────────────────────────────────────────────────────

function WorkflowCardsGrid({
  rows,
  onOpen,
}: {
  readonly rows: readonly WorkflowCardRow[];
  readonly onOpen: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
      {rows.map((r) => (
        <WorkflowCard key={r.dataset.id} row={r} onOpen={() => onOpen(r.dataset.id)} />
      ))}
    </div>
  );
}

function WorkflowCard({
  row,
  onOpen,
}: {
  readonly row: WorkflowCardRow;
  readonly onOpen: () => void;
}) {
  const { dataset, status, records, sources, runningJobs, attention, lastRun } = row;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-left transition-all hover:-translate-y-px hover:bg-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13.5px] font-medium text-foreground">
              {dataset.name}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[10.5px]">
            <StatusPill status={status} />
            <span className="text-muted-foreground/70">{lastRun}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>
          <span className="font-mono text-foreground/85">{records.toLocaleString()}</span> records
        </span>
        <span>
          <span className="font-mono text-foreground/85">{sources}</span> sources
        </span>
        {runningJobs > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            {runningJobs} running
          </span>
        )}
      </div>
      {attention.length > 0 && (
        <div className="mt-2.5 border-t border-dashed border-border/60 pt-2">
          {attention.slice(0, 2).map((msg, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10.5px] text-amber-400">
              <span className="h-1 w-1 rounded-full bg-amber-400" />
              {msg}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function StatusPill({ status }: { readonly status: CardStatus }) {
  const CONFIG: Record<CardStatus, { bg: string; label: string }> = {
    healthy: { bg: "bg-emerald-500/15 text-emerald-300", label: "HEALTHY" },
    training: { bg: "bg-amber-500/15 text-amber-400", label: "TRAINING" },
    attention: { bg: "bg-rose-500/15 text-rose-300", label: "NEEDS ATTN" },
    stale: { bg: "bg-muted/40 text-muted-foreground", label: "STALE" },
    draft: { bg: "bg-muted/40 text-muted-foreground/70", label: "DRAFT" },
  };
  const { bg, label } = CONFIG[status];
  return (
    <span
      className={cn("rounded px-1.5 py-px font-semibold tracking-[0.06em]", bg)}
    >
      {label}
    </span>
  );
}

function statusDotClass(status: CardStatus): string {
  switch (status) {
    case "healthy":
      return "bg-emerald-400";
    case "training":
      return "bg-amber-400";
    case "attention":
      return "bg-rose-400";
    case "stale":
      return "bg-muted-foreground/60";
    case "draft":
    default:
      return "bg-muted-foreground/40";
  }
}

// ─── Quick stats footer ─────────────────────────────────────────────────────

function QuickStats({
  totalRecords,
  evalRuns,
  trainingJobs,
}: {
  readonly totalRecords: number;
  readonly evalRuns: number;
  readonly trainingJobs: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <StatTile label="Total records" value={totalRecords.toLocaleString()} subtitle="across workflows" />
      <StatTile label="Eval runs" value={String(evalRuns)} subtitle={`${evalRuns === 0 ? "no" : ""} evaluations recorded`} />
      <StatTile label="Training jobs" value={String(trainingJobs)} subtitle={`${trainingJobs === 0 ? "no" : ""} finetune runs`} />
    </div>
  );
}

function StatTile({
  label,
  value,
  subtitle,
}: {
  readonly label: string;
  readonly value: string;
  readonly subtitle: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 px-3.5 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-[18px] font-medium text-foreground tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-[10.5px] text-muted-foreground/70">{subtitle}</div>
    </div>
  );
}

// ─── Activity feed ──────────────────────────────────────────────────────────

function ActivityFeed({
  entries,
  onOpen,
}: {
  readonly entries: readonly ActivityEntry[];
  readonly onOpen: (id: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <aside className="rounded-xl border border-border/60 bg-card/40 px-4 py-4 text-[12px] text-muted-foreground">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Activity
        </div>
        No recent runs yet — kick off an evaluation or finetune to populate this feed.
      </aside>
    );
  }
  return (
    <aside className="sticky top-5 max-h-[calc(100vh-6rem)] overflow-hidden rounded-xl border border-border/60 bg-card/40">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Activity
        </span>
        <span className="text-[11px] text-muted-foreground/60">· across all workflows</span>
      </div>
      <div className="max-h-[calc(100vh-8rem)] overflow-y-auto">
        {entries.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onOpen(e.workflowId)}
            className="grid w-full grid-cols-[22px_1fr] items-start gap-2.5 border-b border-border/40 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/30"
          >
            <ActivityIcon kind={e.kind} status={e.status} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-mono text-[11px] text-emerald-300">{e.workflow}</span>
                <span className="rounded bg-muted/50 px-1 text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
                  {e.kind === "eval" ? "Eval" : "Train"}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground/70">
                  {formatRelative(e.timestamp)}
                </span>
              </div>
              <div className="mt-1 text-[11.5px] leading-relaxed text-foreground/80">
                {describeActivity(e)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

function ActivityIcon({ kind, status }: { readonly kind: ActivityEntry["kind"]; readonly status: string }) {
  const terminal = status === "completed";
  const failed = status === "failed" || status === "cancelled";
  const color = failed ? "text-rose-400" : terminal ? "text-emerald-300" : "text-amber-400";
  const Icon = kind === "eval" ? BarChart3 : kind === "train" ? GraduationCap : Upload;
  const StatusIcon = terminal ? CheckCircle2 : failed ? AlertTriangle : null;
  return (
    <div className="relative pt-0.5">
      <Icon className={cn("h-3.5 w-3.5", color)} />
      {StatusIcon && (
        <StatusIcon className={cn("absolute -right-1 -bottom-1 h-2.5 w-2.5", color)} />
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildRow(dataset: Dataset): WorkflowCardRow {
  const evalJobs = dataset.evalJobs ?? [];
  const trainingJobs = dataset.trainingJobs ?? [];
  const runningEvals = evalJobs.filter((j) => j.status === "running" || j.status === "pending").length;
  const runningTrainings = trainingJobs.filter((j) => ["running", "pending", "queued"].includes(j.status)).length;
  const runningJobs = runningEvals + runningTrainings;
  const records = dataset.recordsCount ?? 0;
  const sources = dataset.knowledgeSourceCount ?? 0;

  const attention: string[] = [];
  if (runningEvals > 0) attention.push(`${runningEvals} evaluation${runningEvals === 1 ? "" : "s"} running`);
  if (runningTrainings > 0)
    attention.push(`Training step · ${trainingJobs[0]?.status ?? "running"}`);
  if (records === 0 && sources === 0 && evalJobs.length === 0 && trainingJobs.length === 0) {
    attention.push("No data yet — upload docs or connect gateway");
  }

  let status: CardStatus = "healthy";
  if (runningTrainings > 0) status = "training";
  else if (records === 0) status = "draft";
  else if (Date.now() - dataset.updatedAt > 14 * 24 * 60 * 60 * 1000) status = "stale";
  // "attention" is reserved for quality regressions we don't track at list level.

  return {
    dataset,
    status,
    records,
    sources,
    runningJobs,
    attention,
    lastRun: formatRelative(dataset.updatedAt),
  };
}

function buildActivityFeed(datasets: readonly Dataset[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const d of datasets) {
    for (const j of d.evalJobs ?? []) {
      entries.push({
        id: `eval-${j.id}`,
        workflow: d.name,
        workflowId: d.id,
        kind: "eval",
        status: j.status,
        model: j.model,
        timestamp: j.createdAt,
      });
    }
    for (const j of d.trainingJobs ?? []) {
      entries.push({
        id: `train-${j.id}`,
        workflow: d.name,
        workflowId: d.id,
        kind: "train",
        status: j.status,
        model: j.model,
        timestamp: j.createdAt,
      });
    }
  }
  entries.sort((a, b) => b.timestamp - a.timestamp);
  return entries.slice(0, 12);
}

function describeActivity(e: ActivityEntry): string {
  const model = e.model ? ` · ${e.model}` : "";
  const kindWord = e.kind === "eval" ? "Evaluation" : "Training";
  const statusWord = statusHumanize(e.status);
  return `${kindWord} ${statusWord}${model}`;
}

function statusHumanize(status: string): string {
  switch (status) {
    case "completed":
      return "completed";
    case "running":
      return "running";
    case "pending":
      return "pending";
    case "queued":
      return "queued";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return status;
  }
}

function formatRelative(ts: number): string {
  if (!ts) return "never";
  const diffSec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString();
}

// Unused for now but kept for future activity-icon variants.
export type { ActivityEntry, WorkflowCardRow };

// `ArrowUpRight` reserved for a future "open workflow" affordance — silence
// TS "imported but unused" by referencing it in a zero-cost object literal.
const _unused = { ArrowUpRight };
void _unused;
