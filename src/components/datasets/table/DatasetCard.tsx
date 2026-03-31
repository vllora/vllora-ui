/**
 * DatasetCard
 *
 * Card component for displaying a dataset in grid view.
 * Redesigned with gradient bg, accent bar, stat chips, and tooltips.
 */

import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
  Download,
  FileText,
  MessageSquare,
  Tags,
  FlaskConical,
  CircleCheck,
  Database,
  Zap,
  FileEdit,
  Ban,
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
import type { DatasetFilterGroup } from "@/types/dataset-types";

interface JobSummary {
  readonly id: string;
  readonly status: string;
  readonly model?: string;
}

interface DatasetCardProps {
  name: string;
  filterGroup: DatasetFilterGroup;
  evalJobs?: readonly JobSummary[];
  trainingJobs?: readonly JobSummary[];
  recordCount: number | string;
  topicCount: number;
  docsCount: number;
  hasTopicHierarchy: boolean;
  updatedAt: number;
  isEditing: boolean;
  editingName: string;
  objective?: string;
  hasEvalScript: boolean;
  onSelect: () => void;
  onEditNameChange: (name: string) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onImport?: () => void;
  onDownload?: () => void;
  onDelete: () => void;
}

function formatNumber(num: number | string): string {
  if (typeof num === "string") return num;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toLocaleString();
}

function formatDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function formatFullDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

const ACCENT_COLORS: Record<DatasetFilterGroup, { iconText: string; badgeBg: string; badgeText: string; badgeBorder: string; badgeGlow: string; hoverBorder: string }> = {
  completed: {
    iconText: "text-emerald-500/80",
    badgeBg: "bg-emerald-900/20",
    badgeText: "text-emerald-400",
    badgeBorder: "border-emerald-500/20",
    badgeGlow: "shadow-[0_0_10px_rgba(16,185,129,0.15)]",
    hoverBorder: "hover:border-emerald-500/30",
  },
  in_finetune: {
    iconText: "text-blue-500/80",
    badgeBg: "bg-blue-900/20",
    badgeText: "text-blue-400",
    badgeBorder: "border-blue-500/20",
    badgeGlow: "shadow-[0_0_10px_rgba(59,130,246,0.15)]",
    hoverBorder: "hover:border-blue-500/30",
  },
  draft: {
    iconText: "text-slate-400",
    badgeBg: "bg-slate-800/40",
    badgeText: "text-slate-400",
    badgeBorder: "border-slate-600/30",
    badgeGlow: "shadow-[0_0_10px_rgba(100,116,139,0.15)]",
    hoverBorder: "hover:border-slate-500/30",
  },
};

const STATUS_ICON: Record<DatasetFilterGroup, typeof Database> = {
  completed: Database,
  in_finetune: Zap,
  draft: FileEdit,
};

// ── Helper: status color for tooltip rows ──
function jobStatusColor(status: string): string {
  if (status === "completed" || status === "succeeded") return "text-emerald-400";
  if (status === "running" || status === "pending" || status === "queued") return "text-blue-400";
  if (status === "cancelled") return "text-zinc-400";
  return "text-red-400";
}

function finetuneStatusColor(status: string): string {
  if (status === "completed" || status === "succeeded") return "text-emerald-400";
  if (status === "running") return "text-amber-400";
  if (status === "pending" || status === "queued") return "text-amber-400";
  if (status === "cancelled") return "text-zinc-400";
  return "text-red-400";
}

// ── Jobs footer with tooltip ──
function JobsFooterSummary({
  evalJobs,
  trainingJobs,
  hasEvalScript,
}: {
  readonly evalJobs: readonly JobSummary[];
  readonly trainingJobs: readonly JobSummary[];
  readonly hasEvalScript: boolean;
}) {
  const hasJobs = evalJobs.length > 0 || trainingJobs.length > 0;

  // Eval: latest relevant
  const evalRunning = evalJobs.find(j => j.status === "running" || j.status === "pending");
  const evalDone = evalJobs.find(j => j.status === "completed");
  const evalFailed = evalJobs.find(j => j.status === "failed");
  const evalLatest = evalRunning ?? evalDone ?? evalFailed;

  // Training: latest relevant
  const ftRunning = trainingJobs.find(j => j.status === "running");
  const ftQueued = trainingJobs.find(j => ["pending", "queued"].includes(j.status));
  const ftDone = trainingJobs.find(j => j.status === "completed" || j.status === "succeeded");
  const ftFailed = trainingJobs.find(j => j.status === "failed");
  const ftLatest = ftRunning ?? ftQueued ?? ftDone ?? ftFailed;

  // Build the two summary lines
  const evalLine = (() => {
    if (evalJobs.length === 0) return null;
    if (!evalLatest) return { label: "No active eval", color: "text-zinc-600", pulse: false, model: undefined as string | undefined };
    if (evalRunning) return { label: "Evaluating", color: "text-blue-400", pulse: true, model: evalRunning.model };
    if (evalDone) return { label: "Evaluated", color: "text-emerald-400", pulse: false, model: evalDone.model };
    return { label: "Eval failed", color: "text-red-400", pulse: false, model: evalFailed?.model };
  })();

  const ftLine = (() => {
    if (trainingJobs.length === 0) return null;
    if (!ftLatest) return { label: "No active training", color: "text-zinc-600", pulse: false, model: undefined as string | undefined };
    if (ftRunning) return { label: "Training", color: "text-amber-400", pulse: true, model: ftRunning.model };
    if (ftQueued) return { label: "Queued", color: "text-amber-400", pulse: false, model: ftQueued.model };
    if (ftDone) return { label: "Trained", color: "text-emerald-400", pulse: false, model: ftDone.model };
    return { label: "Training failed", color: "text-red-400", pulse: false, model: ftFailed?.model };
  })();

  // Tooltip content: full job breakdown
  const tooltipContent = (
    <div className="flex flex-col gap-2 py-1">
      {evalJobs.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Eval Jobs ({evalJobs.length})
          </div>
          {evalJobs.map((j) => (
            <div key={j.id} className="flex items-center justify-between gap-3 text-[11px] py-0.5">
              <span className="text-foreground/80 truncate">{j.id.slice(0, 8)}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                {j.model && <span className="text-muted-foreground/60">{j.model}</span>}
                <span className={cn("font-medium", jobStatusColor(j.status))}>{j.status}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {trainingJobs.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Finetune Jobs ({trainingJobs.length})
          </div>
          {trainingJobs.map((j) => (
            <div key={j.id} className="flex items-center justify-between gap-3 text-[11px] py-0.5">
              <span className="text-foreground/80 truncate">{j.id.slice(0, 8)}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                {j.model && <span className="text-muted-foreground/60">{j.model}</span>}
                <span className={cn("font-medium", finetuneStatusColor(j.status))}>{j.status}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // The visible summary rows
  const summaryRows = (
    <div className="flex flex-col gap-1 min-w-0">
      {evalLine && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <FlaskConical className={cn("w-3.5 h-3.5 shrink-0", evalLine.pulse && "animate-pulse", evalLine.color)} />
          <span className={cn("font-medium", evalLine.color)}>{evalLine.label}</span>
          {evalLine.model && <span className="text-muted-foreground/50 text-[10px] truncate">{evalLine.model}</span>}
        </div>
      )}
      {ftLine && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <Zap className={cn("w-3.5 h-3.5 shrink-0", ftLine.pulse && "animate-pulse", ftLine.color)} />
          <span className={cn("font-medium", ftLine.color)}>{ftLine.label}</span>
          {ftLine.model && <span className="text-muted-foreground/50 text-[10px] truncate">{ftLine.model}</span>}
        </div>
      )}
      {!hasJobs && (
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/60">
          {hasEvalScript ? (
            <>
              <FlaskConical className="w-3.5 h-3.5" />
              Eval fn configured
              <CircleCheck className="w-2.5 h-2.5 text-emerald-500" />
            </>
          ) : (
            <>
              <Ban className="w-3.5 h-3.5" />
              No eval fn
            </>
          )}
        </span>
      )}
    </div>
  );

  if (!hasJobs) return summaryRows;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-default">{summaryRows}</div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-[280px]">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
}

export function DatasetCard({
  name,
  filterGroup,
  evalJobs = [],
  trainingJobs = [],
  recordCount,
  topicCount,
  docsCount,
  hasTopicHierarchy,
  hasEvalScript,
  updatedAt,
  isEditing,
  editingName,
  objective,
  onSelect,
  onEditNameChange,
  onSaveRename,
  onCancelRename,
  onStartRename,
  onImport,
  onDownload,
  onDelete,
}: DatasetCardProps) {
  const statusConfig = getFilterGroupConfig(filterGroup);
  const accent = ACCENT_COLORS[filterGroup];
  const StatusIcon = STATUS_ICON[filterGroup];

  return (
    <TooltipProvider delayDuration={400}>
      <div
        className={cn(
          "group relative rounded-xl transition-all duration-300 cursor-pointer overflow-hidden",
          "border border-border/40 bg-gradient-to-b from-card to-card/80",
          "hover:shadow-[0_4px_24px_-4px_rgba(var(--theme-500),0.15)] hover:-translate-y-0.5",
          accent.hoverBorder
        )}
        onClick={onSelect}
      >
        <div className="p-4 h-full flex flex-col">
          {/* Top section */}
          <div className="flex-1">
            {/* Header: icon + title + status badge */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="shrink-0 flex items-center justify-center">
                  <StatusIcon className="w-[18px] h-[18px] text-muted-foreground/50" />
                </div>
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="font-semibold text-sm text-muted-foreground truncate block w-full text-left group-hover:text-foreground transition-colors"
                        >
                          {name}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={4}>
                        <p className="text-xs">{name}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>

              {/* Status badge */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border flex-shrink-0",
                      accent.badgeBg, accent.badgeText, accent.badgeBorder
                    )}
                  >
                    {statusConfig.label}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={4}>
                  <p className="text-xs">{statusConfig.tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Objective */}
            {objective ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-xs text-muted-foreground/70 line-clamp-2 mb-4 leading-relaxed">
                    {objective}
                  </p>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4} className="max-w-xs">
                  <p className="text-xs">{objective}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className="mb-4" />
            )}

            {/* Stat chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/50 text-muted-foreground">
                    <MessageSquare className="w-3 h-3 text-muted-foreground/50" />
                    <span className="text-[10px] font-medium font-mono">{formatNumber(recordCount)} rows</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4}>
                  <p className="text-xs">{formatNumber(recordCount)} training records</p>
                </TooltipContent>
              </Tooltip>

              {hasTopicHierarchy && topicCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/50 text-muted-foreground">
                      <Tags className="w-3 h-3 text-muted-foreground/50" />
                      <span className="text-[10px] font-medium font-mono">{topicCount} topics</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={4}>
                    <p className="text-xs">{topicCount} topics in hierarchy</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {docsCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/50 text-muted-foreground">
                      <FileText className="w-3 h-3 text-muted-foreground/50" />
                      <span className="text-[10px] font-medium font-mono">{docsCount} docs</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={4}>
                    <p className="text-xs">
                      {docsCount} reference document{docsCount !== 1 ? "s" : ""} uploaded
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Footer — job summary lines */}
          <div className="px-0 pt-3 mt-2 border-t border-white/5">
            <div className="flex items-start justify-between gap-2">
            <JobsFooterSummary
              evalJobs={evalJobs}
              trainingJobs={trainingJobs}
              hasEvalScript={hasEvalScript}
            />

            {/* Right side: timestamp + menu */}
            <div className="flex items-center gap-2 shrink-0 pt-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px] text-muted-foreground/40 font-mono">
                      {formatDate(updatedAt)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={4}>
                    <p className="text-xs">Last updated: {formatFullDate(updatedAt)}</p>
                  </TooltipContent>
                </Tooltip>

                {/* Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 flex-shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[140px] p-1">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStartRename(); }} className="text-xs px-2 py-1.5 gap-2">
                      <Pencil className="w-3 h-3" />
                      Rename
                    </DropdownMenuItem>
                    {onImport && (
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onImport(); }} className="text-xs px-2 py-1.5 gap-2">
                        <Upload className="w-3 h-3" />
                        Import Data
                      </DropdownMenuItem>
                    )}
                    {onDownload && (
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDownload(); }} className="text-xs px-2 py-1.5 gap-2">
                        <Download className="w-3 h-3" />
                        Download
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuItem
                      className="text-xs px-2 py-1.5 gap-2 text-red-500 focus:text-red-500"
                      onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
            </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
