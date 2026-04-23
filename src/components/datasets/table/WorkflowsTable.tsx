/**
 * WorkflowsTable
 *
 * Dense list view for /finetune. Replaces the card grid with a single-row
 * workflow table inspired by the dark-emerald workflow-list mock. Renders
 * only data already present in the GET /workflows list response — no extra
 * fetches, no invented metrics. Score column is intentionally honest about
 * "—" when the list payload doesn't carry an eval mean.
 */

import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
  Download,
  FlaskConical,
  Zap,
  CircleAlert,
  CircleCheck,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFilterGroupConfig } from "@/types/dataset-types";
import type { Dataset, DatasetFilterGroup } from "@/types/dataset-types";

interface JobSummary {
  readonly id: string;
  readonly status: string;
  readonly model?: string;
  readonly createdAt: number;
}

interface WorkflowRowProps {
  dataset: Dataset;
  filterGroup: DatasetFilterGroup;
  recordCount: number | "...";
  topicCount: number;
  docsCount: number;
  isEditing: boolean;
  editingName: string;
  onSelect: () => void;
  onEditNameChange: (name: string) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onImport?: () => void;
  onDownload?: () => void;
  onDelete: () => void;
}

interface WorkflowsTableProps {
  rows: readonly WorkflowRowProps[];
}

const STATUS_DOT: Record<DatasetFilterGroup, string> = {
  completed: "bg-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]",
  in_finetune: "bg-blue-400 shadow-[0_0_0_3px_rgba(59,130,246,0.18)]",
  draft: "bg-zinc-500",
};

function formatNumber(num: number | string): string {
  if (typeof num === "string") return num;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return num.toLocaleString();
}

function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatFullDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Pick the most informative latest activity line for a workflow.
 * Order of interest: running training > running eval > most recent terminal job
 * > base workflow updatedAt. Uses only data on the list response.
 */
function deriveLatestActivity(dataset: Dataset): {
  ts: number;
  label: string;
  tone: "training" | "eval" | "ok" | "warn" | "muted";
  pulse: boolean;
} {
  const evalJobs = (dataset.evalJobs ?? []) as readonly JobSummary[];
  const trainJobs = (dataset.trainingJobs ?? []) as readonly JobSummary[];

  const trainRunning = trainJobs.find((j) => j.status === "running");
  if (trainRunning) {
    return { ts: trainRunning.createdAt, label: "Training", tone: "training", pulse: true };
  }
  const evalRunning = evalJobs.find((j) => j.status === "running" || j.status === "pending");
  if (evalRunning) {
    return { ts: evalRunning.createdAt, label: "Evaluating", tone: "eval", pulse: true };
  }
  const trainQueued = trainJobs.find((j) => j.status === "pending" || j.status === "queued");
  if (trainQueued) {
    return { ts: trainQueued.createdAt, label: "Training queued", tone: "warn", pulse: false };
  }
  const allTerminal = [...evalJobs, ...trainJobs]
    .filter((j) => ["completed", "succeeded", "failed", "cancelled"].includes(j.status))
    .sort((a, b) => b.createdAt - a.createdAt);
  const latestTerminal = allTerminal[0];
  if (latestTerminal) {
    const isEval = evalJobs.some((j) => j.id === latestTerminal.id);
    if (latestTerminal.status === "failed") {
      return { ts: latestTerminal.createdAt, label: isEval ? "Eval failed" : "Training failed", tone: "warn", pulse: false };
    }
    return {
      ts: latestTerminal.createdAt,
      label: isEval ? "Evaluated" : "Trained",
      tone: "ok",
      pulse: false,
    };
  }
  return { ts: dataset.updatedAt, label: "Idle", tone: "muted", pulse: false };
}

function WorkflowRow({
  dataset,
  filterGroup,
  recordCount,
  topicCount,
  docsCount,
  isEditing,
  editingName,
  onSelect,
  onEditNameChange,
  onSaveRename,
  onCancelRename,
  onStartRename,
  onImport,
  onDownload,
  onDelete,
}: WorkflowRowProps) {
  const statusConfig = getFilterGroupConfig(filterGroup);
  const dotClass = STATUS_DOT[filterGroup];
  const activity = deriveLatestActivity(dataset);
  const score = dataset.evalStats?.statistics?.mean;
  const samples = dataset.evalStats?.samplesEvaluated;

  const scoreClass =
    score == null
      ? "text-muted-foreground/40"
      : score >= 0.8
      ? "text-emerald-300"
      : score >= 0.65
      ? "text-amber-400"
      : "text-red-400";

  return (
    <div
      className={cn(
        "grid items-center px-4 py-3 border-b border-border/40 cursor-pointer transition-colors",
        "hover:bg-muted/30",
      )}
      style={{ gridTemplateColumns: "minmax(0, 2.4fr) 100px 90px 90px minmax(0, 1.2fr) 90px 32px" }}
      onClick={onSelect}
    >
      {/* Workflow name + status */}
      <div className="flex items-center gap-3 min-w-0 pr-4">
        <span className={cn("w-2 h-2 rounded-full shrink-0", dotClass)} />
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <Input
                value={editingName}
                onChange={(e) => onEditNameChange(e.target.value)}
                className="h-7 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSaveRename();
                  if (e.key === "Escape") onCancelRename();
                }}
              />
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onSaveRename}>
                <Check className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onCancelRename}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-sm font-medium text-foreground truncate">{dataset.name}</div>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={4}>
                  <p className="text-xs">{dataset.name}</p>
                </TooltipContent>
              </Tooltip>
              <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-muted-foreground/70">
                <span className="capitalize">{statusConfig.label.toLowerCase()}</span>
                {dataset.datasetObjective && (
                  <>
                    <span className="text-muted-foreground/30">·</span>
                    <span className="truncate">{dataset.datasetObjective}</span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Records */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-right font-mono text-xs text-muted-foreground tabular-nums">
            {formatNumber(recordCount)}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{formatNumber(recordCount)} training records</p>
        </TooltipContent>
      </Tooltip>

      {/* Sources */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-right font-mono text-xs text-muted-foreground tabular-nums">
            {docsCount > 0 ? docsCount : "—"}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{docsCount} source document{docsCount === 1 ? "" : "s"} (PDFs + traces)</p>
        </TooltipContent>
      </Tooltip>

      {/* Topics */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-right font-mono text-xs text-muted-foreground tabular-nums">
            {topicCount > 0 ? topicCount : "—"}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{topicCount} topics in hierarchy</p>
        </TooltipContent>
      </Tooltip>

      {/* Last activity */}
      <div className="pl-3 flex items-center gap-2 min-w-0 text-xs">
        <ActivityIcon tone={activity.tone} pulse={activity.pulse} />
        <span
          className={cn(
            "truncate",
            activity.tone === "ok" && "text-emerald-400",
            activity.tone === "training" && "text-amber-400",
            activity.tone === "eval" && "text-blue-400",
            activity.tone === "warn" && "text-red-400",
            activity.tone === "muted" && "text-muted-foreground/60",
          )}
        >
          {activity.label}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground/50 font-mono text-[10.5px] shrink-0">
              {formatRelative(activity.ts)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">{formatFullDate(activity.ts)}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Score */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("text-right font-mono text-xs font-medium tabular-nums", scoreClass)}>
            {score == null ? "—" : score.toFixed(2)}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">
            {score == null
              ? "Open the workflow to run an evaluation"
              : `Latest avg eval score · ${samples ?? 0} sample${samples === 1 ? "" : "s"}`}
          </p>
        </TooltipContent>
      </Tooltip>

      {/* Actions */}
      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[140px] p-1">
            <DropdownMenuItem onClick={onStartRename} className="text-xs px-2 py-1.5 gap-2">
              <Pencil className="w-3 h-3" />
              Rename
            </DropdownMenuItem>
            {onImport && (
              <DropdownMenuItem onClick={onImport} className="text-xs px-2 py-1.5 gap-2">
                <Upload className="w-3 h-3" />
                Import Data
              </DropdownMenuItem>
            )}
            {onDownload && (
              <DropdownMenuItem onClick={onDownload} className="text-xs px-2 py-1.5 gap-2">
                <Download className="w-3 h-3" />
                Download
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem
              className="text-xs px-2 py-1.5 gap-2 text-red-500 focus:text-red-500"
              onClick={onDelete}
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ActivityIcon({ tone, pulse }: { tone: string; pulse: boolean }) {
  const icon = (() => {
    switch (tone) {
      case "training":
        return <Zap className="w-3 h-3 text-amber-400" />;
      case "eval":
        return <FlaskConical className="w-3 h-3 text-blue-400" />;
      case "ok":
        return <CircleCheck className="w-3 h-3 text-emerald-400" />;
      case "warn":
        return <CircleAlert className="w-3 h-3 text-red-400" />;
      default:
        return <Loader2 className="w-3 h-3 text-muted-foreground/40" />;
    }
  })();
  return <span className={cn("shrink-0", pulse && "animate-pulse")}>{icon}</span>;
}

export function WorkflowsTable({ rows }: WorkflowsTableProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        {/* Column header */}
        <div
          className="grid items-center px-4 py-2.5 border-b border-border/60 bg-muted/20"
          style={{ gridTemplateColumns: "minmax(0, 2.4fr) 100px 90px 90px minmax(0, 1.2fr) 90px 32px" }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Workflow
          </span>
          <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Records
          </span>
          <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Sources
          </span>
          <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Topics
          </span>
          <span className="pl-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Last activity
          </span>
          <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Score
          </span>
          <span />
        </div>

        {/* Rows */}
        <div className="divide-border/30">
          {rows.map((row) => (
            <WorkflowRow key={row.dataset.id} {...row} />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
