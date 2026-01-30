/**
 * DatasetCard
 *
 * Card component for displaying a dataset in grid view.
 */

import { MoreHorizontal, Pencil, Trash2, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  hasTopicHierarchy: boolean;
  updatedAt: number;
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

export function DatasetCard({
  name,
  state,
  recordCount,
  topicCount,
  hasTopicHierarchy,
  updatedAt,
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
}: DatasetCardProps) {
  const stateConfig = getDatasetStateConfig(state);

  return (
    <div className="group border border-border/60 rounded-lg bg-muted/30 hover:border-[rgb(var(--theme-500))] transition-colors p-4">
      {/* Header with name and menu */}
      <div className="flex items-start justify-between gap-2 mb-3">
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
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onSaveRename}>
                <Check className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onCancelRename}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <button
              className="font-semibold text-foreground truncate block w-full text-left hover:text-[rgb(var(--theme-500))] transition-colors"
              onClick={onSelect}
            >
              {name}
            </button>
          )}
        </div>

        {/* Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onStartRename}>
              <Pencil className="w-4 h-4 mr-2" />
              Rename
            </DropdownMenuItem>
            {onImport && (
              <DropdownMenuItem onClick={onImport}>
                <Upload className="w-4 h-4 mr-2" />
                Import Data
              </DropdownMenuItem>
            )}
            {onDownload && (
              <DropdownMenuItem onClick={onDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-500 focus:text-red-500" onClick={onDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stats row */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 px-2 py-1.5 rounded-lg bg-background/50 border border-border/40 text-center">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">
            Records
          </p>
          <p className="text-sm font-bold text-foreground">
            {formatNumber(recordCount)}
          </p>
        </div>
        <div className="flex-1 px-2 py-1.5 rounded-lg bg-background/50 border border-border/40 text-center">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">
            Topics
          </p>
          <p className="text-sm font-bold text-foreground">
            {hasTopicHierarchy ? topicCount : "--"}
          </p>
        </div>
      </div>

      {/* Footer with state badge and timestamp */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-[10px] font-medium px-2 py-0.5 rounded-full",
            stateConfig.className
          )}
        >
          {stateConfig.label}
        </span>
        <span className="text-xs text-muted-foreground/60">{formatDate(updatedAt)}</span>
      </div>
    </div>
  );
}
