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

import { useMemo } from "react";
import {
  Database,
  FolderOpen,
  ClipboardCheck,
  Brain,
  ChevronRight,
  Target,
  Layers,
  TrendingUp,
  Terminal,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { EvalJobsConsumer } from "@/contexts/EvalJobsContext";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { getJobAverageScore } from "@/types/eval-job";
import { WaitingOrb } from "@/components/onboarding/WaitingOrb";
import { TerminalHint } from "@/components/onboarding/TerminalHint";

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

function getScoreColor(score: number): string {
  if (score >= 0.8) return "text-emerald-400";
  if (score >= 0.6) return "text-yellow-400";
  return "text-red-400";
}

function getScoreBarColor(score: number): string {
  if (score >= 0.8) return "bg-emerald-500";
  if (score >= 0.6) return "bg-yellow-500";
  return "bg-red-500";
}

function getFinetuneStatusLabel(status: string | null): { text: string; color: string } {
  switch (status) {
    case "succeeded": return { text: "Ready", color: "text-emerald-400" };
    case "running": return { text: "Training", color: "text-[rgb(var(--theme-400))]" };
    case "failed": return { text: "Failed", color: "text-red-400" };
    case "pending": return { text: "Queued", color: "text-zinc-400" };
    case "cancelled": return { text: "Cancelled", color: "text-zinc-500" };
    default: return { text: "—", color: "text-zinc-600" };
  }
}


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkspaceWelcome(props: WorkspaceWelcomeProps) {
  const { recordCount, leafTopicCount, knowledgeSourcesCount } = props;
  const isWorkflowEmpty = recordCount === 0 && leafTopicCount === 0;
  const hasKnowledgeSources = knowledgeSourcesCount > 0;

  if (isWorkflowEmpty) {
    return <EmptyWorkflowWelcome datasetName={props.datasetName} hasKnowledgeSources={hasKnowledgeSources} />;
  }
  return <PopulatedWorkflowWelcome {...props} />;
}

// ---------------------------------------------------------------------------
// Empty state — skill-first onboarding
// ---------------------------------------------------------------------------

function EmptyWorkflowWelcome({ datasetName, hasKnowledgeSources }: { readonly datasetName: string; readonly hasKnowledgeSources: boolean }) {
  const steps = [
    { label: "Documents uploaded", isDone: hasKnowledgeSources },
    { label: "Extracting content", isDone: false, isActive: hasKnowledgeSources },
    { label: "Building topic hierarchy", isDone: false },
    { label: "Generating training records", isDone: false },
    { label: "Writing grader", isDone: false },
  ];

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
  generatedCount,
  originalCount,
  leafTopicCount,
  knowledgeSourcesCount,
  hasEvalScript,
}: WorkspaceWelcomeProps) {
  const { lastCompletedJob } = EvalJobsConsumer();
  const { filteredJobs, latestJob } = FinetuneJobsConsumer();

  const evalScore = useMemo(() => {
    if (lastCompletedJob && getJobAverageScore(lastCompletedJob) != null) {
      return getJobAverageScore(lastCompletedJob);
    }
    return undefined;
  }, [lastCompletedJob]);

  const scorePercent = evalScore != null ? Math.round(evalScore * 100) : null;
  const finetuneJobCount = filteredJobs.length;
  const latestFinetuneStatus = latestJob?.status ?? null;
  const ftStatus = getFinetuneStatusLabel(latestFinetuneStatus);

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

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center space-y-1">
          <h2 className="text-sm font-medium text-zinc-300 truncate">{datasetName}</h2>
          <p className="text-xs text-zinc-500">Workflow overview</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2">
          <StatsCard
            label="Records" icon={Database}
            value={formatNumber(recordCount)}
            detail={recordCount > 0 ? `${formatNumber(originalCount)} original · ${formatNumber(generatedCount)} gen` : "No data yet"}
            onClick={() => onOpenTab("data", "data", false)}
          />
          <StatsCard
            label="Topics" icon={Layers}
            value={String(leafTopicCount)}
            detail={leafTopicCount > 0 ? "Leaf topics" : "No hierarchy"}
            onClick={() => onOpenTab("data", "data", false)}
          />
          <button
            onClick={() => onOpenTab("evaluations/jobs", "Evaluations", false)}
            className="bg-zinc-900/50 border border-zinc-800/60 rounded-lg px-3 py-3 text-left hover:border-zinc-700/60 transition-colors"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Eval Score</span>
              <Target className="w-3 h-3 text-zinc-600" />
            </div>
            {scorePercent != null ? (
              <>
                <div className={cn("text-xl font-bold leading-none mb-1.5", getScoreColor(evalScore!))}>
                  {scorePercent}%
                </div>
                <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", getScoreBarColor(evalScore!))} style={{ width: `${scorePercent}%` }} />
                </div>
              </>
            ) : (
              <>
                <div className="text-xl font-bold text-zinc-600 leading-none mb-1">—</div>
                <div className="text-[10px] text-zinc-600">No evaluations</div>
              </>
            )}
          </button>
          <button
            onClick={() => onOpenTab("finetune", "finetune", false)}
            className="bg-zinc-900/50 border border-zinc-800/60 rounded-lg px-3 py-3 text-left hover:border-zinc-700/60 transition-colors"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Training</span>
              <TrendingUp className="w-3 h-3 text-zinc-600" />
            </div>
            <div className="text-xl font-bold text-zinc-200 leading-none mb-1">{finetuneJobCount}</div>
            <div className="flex items-center gap-1.5 text-[10px]">
              {latestFinetuneStatus ? (
                <>
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                    latestFinetuneStatus === "succeeded" ? "bg-emerald-500" :
                    latestFinetuneStatus === "running" ? "bg-[rgb(var(--theme-500))] animate-pulse" :
                    latestFinetuneStatus === "failed" ? "bg-red-500" : "bg-zinc-600"
                  )} />
                  <span className={ftStatus.color}>{ftStatus.text}</span>
                </>
              ) : (
                <span className="text-zinc-600">No jobs</span>
              )}
            </div>
          </button>
        </div>

        {/* Quick actions */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2 px-0.5">Open</p>
          <div className="grid grid-cols-2 gap-1.5">
            {actions.map((action) => (
              <button
                key={action.path}
                onClick={() => onOpenTab(action.path, action.label, false)}
                className="group flex items-center gap-2.5 px-3 py-2.5 rounded-md text-left transition-all hover:bg-zinc-800/50"
              >
                <action.icon className={cn("h-3.5 w-3.5 shrink-0", action.iconColor)} />
                <span className="text-[11px] font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors flex-1 min-w-0">
                  {action.label}
                </span>
                <ChevronRight className="h-3 w-3 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-[11px] text-zinc-600">Or click items in the explorer sidebar</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared stat card
// ---------------------------------------------------------------------------

function StatsCard({ label, icon: Icon, value, detail, onClick }: {
  readonly label: string;
  readonly icon: typeof Database;
  readonly value: string;
  readonly detail: string;
  readonly onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="bg-zinc-900/50 border border-zinc-800/60 rounded-lg px-3 py-3 text-left hover:border-zinc-700/60 transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
        <Icon className="w-3 h-3 text-zinc-600" />
      </div>
      <div className="text-xl font-bold text-zinc-200 leading-none mb-1">{value}</div>
      <div className="text-[10px] text-zinc-500">{detail}</div>
    </button>
  );
}
