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
import { getDatasetStateConfig } from "@/types/dataset-types";
import type { DatasetState } from "@/types/dataset-types";

interface DatasetCardProps {
  name: string;
  state: DatasetState;
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

function getStateTooltip(state: DatasetState): string {
  switch (state) {
    case "completed":
      return "Training completed successfully";
    case "in_finetune":
      return "Dataset is being used in fine-tuning";
    case "draft":
    default:
      return "Dataset is being prepared for training";
  }
}

export function DatasetCard({
  name,
  state,
  recordCount,
  topicCount,
  docsCount,
  hasTopicHierarchy,
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
  const stateConfig = getDatasetStateConfig(state);

  return (
    <TooltipProvider delayDuration={400}>
      <div
        className={cn(
          "group relative rounded-xl transition-all duration-200 cursor-pointer overflow-hidden",
          "border border-border/40 bg-gradient-to-b from-card to-card/80",
          "hover:border-border hover:shadow-[0_4px_24px_-4px_rgba(var(--theme-500),0.15)] hover:-translate-y-0.5"
        )}
      >
        {/* Top accent bar */}
        <div
          className={cn(
            "h-0.5 w-full",
            state === "completed"
              ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
              : state === "in_finetune"
                ? "bg-gradient-to-r from-amber-500 to-amber-400"
                : "bg-border/30"
          )}
        />

        <div className="p-4">
          {/* Header with name and menu */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0 flex-1">
              {isEditing ? (
                <div className="flex items-center gap-2">
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={onSaveRename}
                  >
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={onCancelRename}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="font-semibold text-foreground truncate block w-full text-left hover:text-[rgb(var(--theme-500))] transition-colors"
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

            {/* Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 flex-shrink-0 opacity-40 hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
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

          {/* Objective */}
          {objective && (
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-[11px] text-muted-foreground/70 line-clamp-2 mb-3 leading-relaxed">
                  {objective}
                </p>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4} className="max-w-xs">
                <p className="text-xs">{objective}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {!objective && <div className="mb-3" />}

          {/* Stat chips */}
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/50 text-[10px] text-muted-foreground font-medium">
                  <MessageSquare className="w-2.5 h-2.5" />
                  {formatNumber(recordCount)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <p className="text-xs">{formatNumber(recordCount)} training records</p>
              </TooltipContent>
            </Tooltip>

            {hasTopicHierarchy && topicCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/50 text-[10px] text-muted-foreground font-medium">
                    <Tags className="w-2.5 h-2.5" />
                    {topicCount}
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
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/50 text-[10px] text-muted-foreground font-medium">
                    <FileText className="w-2.5 h-2.5" />
                    {docsCount}
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

          {/* Footer with state badge and timestamp */}
          <div className="flex items-center justify-between">
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "text-[10px] font-medium px-2 py-0.5 rounded-full",
                    stateConfig.className
                  )}
                >
                  {stateConfig.label}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <p className="text-xs">{getStateTooltip(state)}</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs text-muted-foreground/60">
                  {formatDate(updatedAt)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <p className="text-xs">Last updated: {formatFullDate(updatedAt)}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
