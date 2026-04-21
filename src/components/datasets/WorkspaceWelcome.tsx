/**
 * WorkspaceWelcome
 *
 * Clean welcome state shown when all workspace tabs are closed.
 *
 * Two modes:
 * - **Empty** (no records, no topics): Shows skill-first onboarding guidance
 *   with pipeline steps and CLI command hint
 * - **Has data**: Shows workflow statistics at a glance, plus quick-action
 *   cards matching explorer sidebar sections to reopen any tab
 */

import { useEffect } from "react";
import {
  Database,
  FolderOpen,
  ClipboardCheck,
  Brain,
  ChevronRight,
  Terminal,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { EvalJobsConsumer } from "@/contexts/EvalJobsContext";
import { getJobAverageScore } from "@/types/eval-job";
import type { EvalJob } from "@/types/eval-job";
import type { EvalStats } from "@/types/dataset-types";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { WaitingOrb } from "@/components/onboarding/WaitingOrb";
import { TerminalHint } from "@/components/onboarding/TerminalHint";
import { PipelineStrip } from "./DatasetOverviewPanel/PipelineStrip";
import { HealthRow } from "./DatasetOverviewPanel/HealthRow";
import { HierarchyInspector } from "./DatasetOverviewPanel/HierarchyInspector";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkspaceWelcomeProps {
  datasetName: string;
  onOpenTab: (path: string, label?: string, preview?: boolean) => void;

  // Data stats
  recordCount: number;
  generatedCount: number;
  originalCount: number;
  leafTopicCount: number;

  // Quick-action status data
  planStatus: string | null;
  knowledgeSourcesCount: number;
  hasEvalScript: boolean;
  hasReadme: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

/**
 * Single source of truth for the dataset's latest average score.
 *
 * Prefers the most recent completed job's pollingSnapshot/result (what
 * HealthRow's trend uses internally), falling back to the persisted
 * `dataset.evalStats.statistics.mean`. This keeps PipelineStrip's
 * `qualityPercent` and HealthRow's hero score in lockstep.
 */
function computeDatasetScore(
  evalJobs: readonly EvalJob[],
  evalStats: EvalStats | undefined,
): number | null {
  const latestCompleted = evalJobs
    .filter((j) => j.status === "completed")
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0];
  const fromJob = latestCompleted ? getJobAverageScore(latestCompleted) : undefined;
  if (fromJob != null) return fromJob;
  return evalStats?.statistics.mean ?? null;
}



// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkspaceWelcome(props: WorkspaceWelcomeProps) {
  const { recordCount, leafTopicCount, knowledgeSourcesCount } = props;
  const isWorkflowEmpty = recordCount === 0 && leafTopicCount === 0;
  const hasKnowledgeSources = knowledgeSourcesCount > 0;

  if (isWorkflowEmpty) {
    return (
      <EmptyWorkflowWelcome
        datasetName={props.datasetName}
        hasKnowledgeSources={hasKnowledgeSources}
        hasTopics={leafTopicCount > 0}
        hasRecords={recordCount > 0}
        hasEvalScript={props.hasEvalScript}
      />
    );
  }
  return <PopulatedWorkflowWelcome {...props} />;
}

// ---------------------------------------------------------------------------
// Empty state — skill-first onboarding
// ---------------------------------------------------------------------------

function EmptyWorkflowWelcome({
  datasetName,
  hasKnowledgeSources,
  hasTopics,
  hasRecords,
  hasEvalScript,
}: {
  readonly datasetName: string;
  readonly hasKnowledgeSources: boolean;
  readonly hasTopics: boolean;
  readonly hasRecords: boolean;
  readonly hasEvalScript: boolean;
}) {
  // Active step = first incomplete step after the most recent done one.
  const stepStates = [
    { label: "Documents uploaded", isDone: hasKnowledgeSources },
    { label: "Extracting content", isDone: hasKnowledgeSources && hasTopics },
    { label: "Building topic hierarchy", isDone: hasTopics },
    { label: "Generating training records", isDone: hasRecords },
    { label: "Writing grader", isDone: hasEvalScript },
  ];
  const activeIndex = stepStates.findIndex((s) => !s.isDone);
  const steps = stepStates.map((s, i) => ({
    ...s,
    isActive: i === activeIndex && hasKnowledgeSources,
  }));

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
      <div className="w-full max-w-md space-y-6 text-center">
        <WaitingOrb icon={Terminal} className="mx-auto mb-2" />

        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold text-zinc-200 truncate">{datasetName}</h2>
          <p className="text-xs text-zinc-500">
            {hasKnowledgeSources
              ? "The finetune skill is processing your documents. Data will appear as each step completes."
              : "Run the finetune skill to populate this workflow with training data."}
          </p>
        </div>

        {/* Pipeline progress */}
        <div className="flex flex-col rounded-xl border border-border/30 bg-zinc-900/40 overflow-hidden text-left">
          {steps.map((step) => {
            const isActive = !!step.isActive && !step.isDone;
            return (
              <div
                key={step.label}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-2.5 text-[12px] border-b border-border/15 last:border-b-0",
                  step.isDone ? "text-zinc-400" :
                  isActive ? "text-[rgb(var(--theme-400))] font-medium" :
                  "text-zinc-600",
                )}
              >
                <span className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[9px] shrink-0",
                  step.isDone ? "bg-[rgba(var(--theme-500),0.15)] text-[rgb(var(--theme-400))]" :
                  isActive ? "bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-400))] animate-pulse" :
                  "bg-zinc-800/60 text-zinc-600",
                )}>
                  {step.isDone ? "✓" : isActive ? "⟳" : "○"}
                </span>
                {step.label}
              </div>
            );
          })}
        </div>

        <TerminalHint
          command='claude "finetune your-document.pdf"'
          highlight="claude"
          className="mx-auto"
        />

        <Link
          to="/finetune/setup"
          className="inline-flex text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          View setup guide →
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Populated state — statistics + quick actions
// ---------------------------------------------------------------------------

function PopulatedWorkflowWelcome({
  datasetName,
  onOpenTab,
  recordCount,
  generatedCount: _generatedCount,
  originalCount: _originalCount,
  leafTopicCount,
  knowledgeSourcesCount,
  hasEvalScript,
}: WorkspaceWelcomeProps) {
  const { jobs: evalJobs, ensureJobSnapshotLoaded } = EvalJobsConsumer();
  const { filteredJobs, latestJob } = FinetuneJobsConsumer();

  // Eagerly hydrate the latest completed eval job's pollingSnapshot so the
  // overview can show a score. Without this, dataset.evalStats is undefined
  // on fresh page loads (api adapter's updateEvalStats is a no-op) and the
  // completed job has no in-memory score → HealthRow shows "No evaluations yet".
  const latestCompletedEvalJobId = evalJobs
    .filter((j) => j.status === "completed")
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0]?.id;
  useEffect(() => {
    if (!latestCompletedEvalJobId) return;
    ensureJobSnapshotLoaded(latestCompletedEvalJobId);
  }, [latestCompletedEvalJobId, ensureJobSnapshotLoaded]);
  const { sources: knowledgeSources, count: sourcesCount, totalParts } = KnowledgeSourcesConsumer();
  const { dataset, sortedRecords } = DatasetDetailConsumer();
  const trainingActive = filteredJobs.some(j => ['pending', 'queued', 'running'].includes(j.status));

  const finetuneJobCount = filteredJobs.length;
  const latestFinetuneStatus = latestJob?.status ?? null;

  const actions = [
    {
      path: "data", label: "Data", icon: Database,
      iconColor: "text-emerald-500",
      status: recordCount > 0 ? `${formatNumber(recordCount)} records` : "No records yet",
      active: recordCount > 0,
    },
    {
      path: "knowledge", label: "Knowledge", icon: FolderOpen,
      iconColor: "text-blue-400",
      status: knowledgeSourcesCount > 0
        ? `${knowledgeSourcesCount} source${knowledgeSourcesCount !== 1 ? "s" : ""}`
        : "No sources",
      active: knowledgeSourcesCount > 0,
    },
    {
      path: "evaluations/jobs", label: "Evaluations", icon: ClipboardCheck,
      iconColor: "text-violet-500",
      status: hasEvalScript ? "Grader configured" : "Not configured",
      active: hasEvalScript,
    },
    {
      path: "finetune", label: "Training", icon: Brain,
      iconColor: "text-orange-500",
      status: finetuneJobCount > 0
        ? `${finetuneJobCount} job${finetuneJobCount !== 1 ? "s" : ""}`
        : "No jobs",
      active: finetuneJobCount > 0,
    },
  ];

  // Workflow IDs needed by PipelineStrip / Hero — derived from dataset, not props.
  const workflowId = dataset?.id ?? "";

  // Aggregate counts for the pipeline strip — prefer live context counts, fall
  // back to the prop / dataset summary if context hasn't hydrated yet.
  const sourcesAggregate = sourcesCount || knowledgeSourcesCount;
  const partsAggregate = totalParts || knowledgeSources.reduce((sum, s) => sum + s.parts.length, 0);
  const topicsAggregate = leafTopicCount || (dataset?.topicCount ?? 0);
  const recordsAggregate = recordCount || (dataset?.recordsCount ?? 0);

  const topicsWithPartsPercent = computeTopicsWithPartsPercent(dataset?.topicHierarchy?.hierarchy);
  const datasetScore = computeDatasetScore(evalJobs, dataset?.evalStats);

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] px-6 pt-4 pb-10 space-y-4">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="text-[20px] font-semibold tracking-[-0.015em] text-foreground truncate">
            {datasetName}
          </h2>
          <span className="text-[12px] text-muted-foreground">· Workflow overview</span>
        </div>

        {/* Pipeline strip — 5 clickable stages */}
        <div className="overflow-hidden rounded-lg border border-border/50">
          <PipelineStrip
            workflowId={workflowId}
            sourcesCount={sourcesAggregate}
            partsCount={partsAggregate}
            topicsCount={topicsAggregate}
            recordsCount={recordsAggregate}
            trainingCount={filteredJobs.length}
            docsCount={knowledgeSources.filter((s) => s.traceBundleId == null).length}
            servicesCount={knowledgeSources.filter((s) => s.traceBundleId != null).length}
            topicsWithPartsPercent={topicsWithPartsPercent}
            qualityPercent={datasetScore != null ? datasetScore * 100 : undefined}
            trainingActive={trainingActive}
            trainingStatus={latestFinetuneStatus ?? undefined}
            onSwitchTab={(tab) => {
              const map: Record<string, { path: string; label: string }> = {
                knowledge: { path: "knowledge", label: "Knowledge" },
                records: { path: "data", label: "data" },
                jobs: { path: "finetune", label: "finetune" },
              };
              const entry = map[tab] ?? { path: tab, label: tab };
              onOpenTab(entry.path, entry.label, false);
            }}
          />
        </div>

        {/* Dataset quality hero + ministat sidecars */}
        <HealthRow
          evalJobs={evalJobs}
          evalStats={dataset?.evalStats}
          topicHierarchy={dataset?.topicHierarchy?.hierarchy}
          totalRecords={recordCount}
          onOpenEvalDetails={() => onOpenTab("evaluations/jobs", "Evaluations", false)}
        />

        {/* Topic hierarchy + click-to-inspect */}
        {dataset?.topicHierarchy?.hierarchy && dataset.topicHierarchy.hierarchy.length > 0 && (
          <HierarchyInspector
            hierarchy={dataset.topicHierarchy.hierarchy}
            records={sortedRecords}
            sources={knowledgeSources}
            onOpenTopic={() => onOpenTab("data", "data", false)}
            onOpenRecord={() => onOpenTab("data", "data", false)}
          />
        )}

        {/* Quick actions */}
        <div>
          <p className="mb-2 px-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
            Open
          </p>
          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
            {actions.map((action) => (
              <button
                key={action.path}
                onClick={() => onOpenTab(action.path, action.label, false)}
                className="group flex items-center gap-2.5 rounded-md border border-border/40 bg-card/30 px-3 py-2 text-left transition-colors hover:bg-muted/30"
              >
                <action.icon className={cn("h-3.5 w-3.5 shrink-0", action.iconColor)} />
                <span className="flex-1 min-w-0 truncate text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  {action.label}
                </span>
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** % of leaf topics that have at least one linked knowledge-source part. */
function computeTopicsWithPartsPercent(
  hierarchy: readonly import("@/types/dataset-types").TopicHierarchyNode[] | undefined,
): number | undefined {
  if (!hierarchy || hierarchy.length === 0) return undefined;
  let total = 0;
  let covered = 0;
  const walk = (n: import("@/types/dataset-types").TopicHierarchyNode) => {
    const isLeaf = !n.children || n.children.length === 0;
    if (isLeaf) {
      total += 1;
      if ((n.sourceChunkRefs?.length ?? 0) > 0) covered += 1;
    }
    for (const child of n.children ?? []) walk(child);
  };
  hierarchy.forEach(walk);
  return total === 0 ? 0 : (covered / total) * 100;
}

