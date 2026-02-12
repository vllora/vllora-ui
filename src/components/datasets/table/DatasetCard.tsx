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

interface DatasetCardProps {
  name: string;
  filterGroup: DatasetFilterGroup;
  activeEvalJobs: number;
  completedEvalJobs: number;
  activeFinetuneJob: boolean;
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

export function DatasetCard({
  name,
  filterGroup,
  activeEvalJobs,
  completedEvalJobs,
  activeFinetuneJob,
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
                    <div className="flex items-center gap-1.5">
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
                        <button
                          className="font-semibold text-sm text-muted-foreground truncate block w-full text-left group-hover:text-foreground transition-colors"
                          onClick={onSelect}
                        >
                          {name}
                        </button>
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

          {/* Footer — separated by border */}
          <div className="px-0 pt-3 mt-2 border-t border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {/* Active jobs — can show both simultaneously */}
              {activeFinetuneJob && (
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-blue-400">
                  <Zap className="w-3.5 h-3.5 animate-pulse" />
                  Finetuning...
                </span>
              )}
              {activeEvalJobs > 0 && (
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-blue-400">
                  <FlaskConical className="w-3.5 h-3.5 animate-pulse" />
                  {activeEvalJobs} eval running...
                </span>
              )}
              {/* Idle states — only show when nothing is actively running */}
              {!activeFinetuneJob && activeEvalJobs === 0 && (
                completedEvalJobs > 0 ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-[rgb(var(--theme-500))]">
                        <CircleCheck className="w-3.5 h-3.5" />
                        {completedEvalJobs} eval{completedEvalJobs > 1 ? "s" : ""} completed
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={4}>
                      <p className="text-xs">
                        {completedEvalJobs} evaluation{completedEvalJobs > 1 ? "s" : ""} completed
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ) : hasEvalScript ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <FlaskConical className="w-3.5 h-3.5" />
                    Eval fn configured
                    <CircleCheck className="w-2.5 h-2.5 text-emerald-500" />
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/60">
                    <Ban className="w-3.5 h-3.5" />
                    No eval fn
                  </span>
                )
              )}
            </div>

            <div className="flex items-center gap-3">
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
                  >
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
        </div>
      </div>
    </TooltipProvider>
  );
}
