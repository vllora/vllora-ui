/**
 * DatasetItemHeader
 *
 * Header for a dataset item in the list view with expand/collapse, rename, and actions.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatasetActionsMenu } from "./DatasetActionsMenu";

interface DatasetItemHeaderProps {
  name: string;
  recordCount: number | string;
  updatedAt: number;
  isExpanded: boolean;
  isEditing: boolean;
  editingName: string;
  onToggle: () => void;
  onSelect: () => void;
  onEditNameChange: (name: string) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onImport?: () => void;
  onDownload?: () => void;
  onDelete: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

export function DatasetItemHeader({
  name,
  recordCount,
  updatedAt,
  isExpanded,
  isEditing,
  editingName,
  onToggle,
  onSelect,
  onEditNameChange,
  onSaveRename,
  onCancelRename,
  onStartRename,
  onImport,
  onDownload,
  onDelete,
}: DatasetItemHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors",
        isExpanded && "border-b border-border"
      )}
      onClick={() => !isEditing && onToggle()}
    >
      <div className="flex items-center gap-3">
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        {isEditing ? (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Input
              value={editingName}
              onChange={(e) => onEditNameChange(e.target.value)}
              className="h-7 w-48"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveRename();
                if (e.key === "Escape") onCancelRename();
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={onSaveRename}
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={onCancelRename}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              className="font-semibold text-foreground hover:text-[rgb(var(--theme-500))] hover:underline transition-colors text-left"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
            >
              {name}
            </button>
            <span className="text-sm text-muted-foreground">
              ({recordCount})
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          Updated {formatRelativeTime(updatedAt)}
        </span>
        <DatasetActionsMenu
          onRename={onStartRename}
          onImport={onImport}
          onDownload={onDownload}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
