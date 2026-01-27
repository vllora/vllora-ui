/**
 * DatasetTableRow
 *
 * A single row in the datasets table view.
 */

import { Database, MoreVertical, Pencil, Trash2, Upload, Download, Tag } from "lucide-react";
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

interface DatasetTableRowProps {
  datasetId: string;
  name: string;
  recordCount: number | string;
  topicCoverage: { total: number; withTopic: number } | null;
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
  return num.toLocaleString();
}

function formatDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;

  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DatasetTableRow({
  name,
  recordCount,
  topicCoverage,
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
}: DatasetTableRowProps) {
  const coveragePercent =
    hasTopicHierarchy && topicCoverage && topicCoverage.total > 0
      ? Math.round((topicCoverage.withTopic / topicCoverage.total) * 100)
      : null;

  return (
    <div className="grid grid-cols-[1fr_120px_200px_160px_48px] items-center px-6 py-4 border-b border-border hover:bg-muted/30 transition-colors">
      {/* Dataset Name */}
      <div className="flex items-center gap-3 min-w-0">
        <Database className="w-5 h-5 text-emerald-500 flex-shrink-0" />
        {isEditing ? (
          <div className="flex items-center gap-2">
            <Input
              value={editingName}
              onChange={(e) => onEditNameChange(e.target.value)}
              className="h-8 w-56"
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
          <button
            className="font-medium text-foreground truncate hover:text-emerald-500 hover:underline transition-colors text-left"
            onClick={onSelect}
          >
            {name}
          </button>
        )}
      </div>

      {/* Records */}
      <div className="text-muted-foreground text-sm">
        {formatNumber(recordCount)}
      </div>

      {/* Topic Coverage */}
      <div className="flex items-center gap-3">
        {!hasTopicHierarchy ? (
          <span className="text-muted-foreground text-sm">—</span>
        ) : coveragePercent === null ? (
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-muted rounded-full" />
            <span className="text-muted-foreground text-sm">Not Analyzed</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${coveragePercent}%` }}
              />
            </div>
            <span className="text-muted-foreground text-sm w-10">
              {coveragePercent}%
            </span>
            <Tag className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Last Modified */}
      <div className="text-muted-foreground text-sm">{formatDate(updatedAt)}</div>

      {/* Actions */}
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="w-4 h-4 text-muted-foreground" />
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
            <DropdownMenuItem
              className="text-red-500 focus:text-red-500"
              onClick={onDelete}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
