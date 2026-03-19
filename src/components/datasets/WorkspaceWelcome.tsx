/**
 * WorkspaceWelcome
 *
 * Clean welcome state shown when all workspace tabs are closed.
 * Displays workflow statistics at a glance, plus quick-action cards
 * matching explorer sidebar sections to reopen any tab.
 *
 * Consumes DryRunJobsContext and FinetuneJobsContext directly (rendered
 * inside their providers) so the parent doesn't need to thread all the data.
 */

import { useMemo } from "react";
import {
  ScrollText,
  Database,
  FolderOpen,
  ClipboardCheck,
  Brain,
  BookOpen,
  ChevronRight,
  Target,
  Layers,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EvalJobsConsumer } from "@/contexts/EvalJobsContext";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { getJobAverageScore } from "@/types/eval-job";

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

function getPlanStatusText(planStatus: string | null): string {
  switch (planStatus) {
    case "proposed": return "Awaiting approval";
    case "approved": return "Approved";
    case "executing": return "Executing";
    case "completed": return "Completed";
    default: return "Not started";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkspaceWelcome({
  datasetName,
  onOpenTab,
  recordCount,
  generatedCount,
  originalCount,
  leafTopicCount,
  planStatus,
  knowledgeSourcesCount,
  hasEvalScript,
  hasReadme,
}: WorkspaceWelcomeProps) {
  // Consume job contexts (we're rendered inside their providers)
  const { lastCompletedJob } = EvalJobsConsumer();
  const { filteredJobs, latestJob } = FinetuneJobsConsumer();

  // Derive eval stats from most recent completed job
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

  // Quick action cards — match explorer sidebar sections
  const actions = [
    {
      path: "plan.md",
      label: "Plan",
      icon: ScrollText,
      iconColor: "text-[rgb(var(--theme-500))]",
      status: getPlanStatusText(planStatus),
      active: !!planStatus && planStatus !== "idle",
    },
    {
      path: "data",
      label: "Data",
      icon: Database,
      iconColor: "text-emerald-500",
      status: recordCount > 0 ? `${formatNumber(recordCount)} records` : "No records yet",
      active: recordCount > 0,
    },
    {
      path: "knowledge",
      label: "Knowledge",
      icon: FolderOpen,
      iconColor: "text-blue-400",
      status: knowledgeSourcesCount > 0
        ? `${knowledgeSourcesCount} source${knowledgeSourcesCount !== 1 ? "s" : ""}`
        : "No sources",
      active: knowledgeSourcesCount > 0,
    },
    {
      path: "evaluations/jobs",
      label: "Evaluations",
      icon: ClipboardCheck,
      iconColor: "text-violet-500",
      status: hasEvalScript ? "Evaluator configured" : "Not configured",
      active: hasEvalScript,
    },
    {
      path: "finetune",
      label: "Training",
      icon: Brain,
      iconColor: "text-orange-500",
      status: finetuneJobCount > 0
        ? `${finetuneJobCount} job${finetuneJobCount !== 1 ? "s" : ""}`
        : "No jobs",
      active: finetuneJobCount > 0,
    },
    {
      path: "readme.md",
      label: "README",
      icon: BookOpen,
      iconColor: "text-blue-500",
      status: hasReadme ? "Generated" : "Not generated",
      active: hasReadme,
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
      <div className="w-full max-w-xl space-y-6">
        {/* Heading */}
        <div className="text-center space-y-1">
          <h2 className="text-sm font-medium text-zinc-300 truncate">
            {datasetName}
          </h2>
          <p className="text-xs text-zinc-500">
            Workflow overview
          </p>
        </div>

        {/* ── Statistics row ── */}
        <div className="grid grid-cols-4 gap-2">
          {/* Records */}
          <button
            onClick={() => onOpenTab("data", "data", false)}
            className="bg-zinc-900/50 border border-zinc-800/60 rounded-lg px-3 py-3 text-left hover:border-zinc-700/60 transition-colors"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                Records
              </span>
              <Database className="w-3 h-3 text-zinc-600" />
            </div>
            <div className="text-xl font-bold text-zinc-200 leading-none mb-1">
              {formatNumber(recordCount)}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
              {recordCount > 0 ? (
                <>
                  <span>{formatNumber(originalCount)} original</span>
                  <span className="text-zinc-700">·</span>
                  <span>{formatNumber(generatedCount)} gen</span>
                </>
              ) : (
                <span>No data yet</span>
              )}
            </div>
          </button>

          {/* Topics */}
          <button
            onClick={() => onOpenTab("data", "data", false)}
            className="bg-zinc-900/50 border border-zinc-800/60 rounded-lg px-3 py-3 text-left hover:border-zinc-700/60 transition-colors"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                Topics
              </span>
              <Layers className="w-3 h-3 text-zinc-600" />
            </div>
            <div className="text-xl font-bold text-zinc-200 leading-none mb-1">
              {leafTopicCount}
            </div>
            <div className="text-[10px] text-zinc-500">
              {leafTopicCount > 0 ? "Leaf topics" : "No hierarchy"}
            </div>
          </button>

          {/* Eval Score */}
          <button
            onClick={() => onOpenTab("evaluations/jobs", "Evaluations", false)}
            className="bg-zinc-900/50 border border-zinc-800/60 rounded-lg px-3 py-3 text-left hover:border-zinc-700/60 transition-colors"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                Eval Score
              </span>
              <Target className="w-3 h-3 text-zinc-600" />
            </div>
            {scorePercent != null ? (
              <>
                <div className={cn("text-xl font-bold leading-none mb-1.5", getScoreColor(evalScore!))}>
                  {scorePercent}%
                </div>
                <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", getScoreBarColor(evalScore!))}
                    style={{ width: `${scorePercent}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="text-xl font-bold text-zinc-600 leading-none mb-1">—</div>
                <div className="text-[10px] text-zinc-600">No evaluations</div>
              </>
            )}
          </button>

          {/* Training */}
          <button
            onClick={() => onOpenTab("finetune", "finetune", false)}
            className="bg-zinc-900/50 border border-zinc-800/60 rounded-lg px-3 py-3 text-left hover:border-zinc-700/60 transition-colors"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                Training
              </span>
              <TrendingUp className="w-3 h-3 text-zinc-600" />
            </div>
            <div className="text-xl font-bold text-zinc-200 leading-none mb-1">
              {finetuneJobCount}
            </div>
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

        {/* ── Quick action grid ── */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2 px-0.5">
            Open
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {actions.map((action) => (
              <button
                key={action.path}
                onClick={() => onOpenTab(action.path, action.label, false)}
                className="group flex items-center gap-2.5 px-3 py-2.5 rounded-md text-left transition-all hover:bg-zinc-800/50"
              >
                <action.icon className={cn("h-3.5 w-3.5 shrink-0", action.iconColor)} />
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">
                    {action.label}
                  </span>
                </div>
                <ChevronRight className="h-3 w-3 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Hint */}
        <p className="text-center text-[11px] text-zinc-600">
          Or click items in the explorer sidebar
        </p>
      </div>
    </div>
  );
}
