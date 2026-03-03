/**
 * TopicNodeHeader
 *
 * Header section for TopicNodeComponent displaying name and record count badge.
 * Supports inline renaming on double-click (non-root nodes only).
 * Names are displayed in human-readable title case (e.g., "Move Evaluation").
 */

import { useState, useRef, useEffect } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TopicNodeHeaderProps {
  name: string;
  recordCount: number;
  /** For parent nodes: aggregated count of all descendants */
  aggregatedRecordCount?: number;
  isRoot: boolean;
  isExpanded: boolean;
  /** Coverage percentage from coverageStats (0-100) — shown in record count tooltip */
  coveragePercentage?: number;
  /** Called when the topic is renamed. Only available for non-root nodes. */
  onRename?: (newName: string) => void;
  /** 7.4: Filtered record count when a stat filter is active (null = no filter) */
  filteredCount?: number | null;
}

const HEADER_HEIGHT = 44;

/**
 * Convert snake_case topic names to human-readable Title Case.
 * e.g., "move_evaluation" → "Move Evaluation"
 */
export function formatTopicName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TopicNodeHeader({
  name,
  recordCount,
  aggregatedRecordCount,
  isRoot,
  isExpanded,
  coveragePercentage,
  onRename,
  filteredCount,
}: TopicNodeHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const [isHovered, setIsHovered] = useState(false);
  // Track optimistic name to show immediately after save, before prop updates
  const [optimisticName, setOptimisticName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Root node with no records is just a simple node (no expand ability)
  const isEmptyRoot = isRoot && recordCount === 0;
  const canRename = !isRoot && onRename;

  // The name to display - use optimistic name if set, otherwise prop
  const displayName = optimisticName ?? name;

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Clear optimistic name when prop catches up
  useEffect(() => {
    if (optimisticName && name === optimisticName) {
      setOptimisticName(null);
    }
  }, [name, optimisticName]);

  // Reset edit value when name changes externally
  useEffect(() => {
    setEditValue(name);
  }, [name]);

  const handleStartEditing = (e: React.MouseEvent) => {
    if (!canRename) return;
    e.stopPropagation();
    setIsEditing(true);
    setEditValue(displayName);
  };

  const handleSave = () => {
    const trimmedValue = editValue.trim();
    if (trimmedValue && trimmedValue !== displayName && onRename) {
      // Set optimistic name to show immediately
      setOptimisticName(trimmedValue);
      onRename(trimmedValue);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(displayName);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  // Human-readable display name (title case)
  const formattedDisplayName = formatTopicName(displayName);

  // Record count for display
  const displayCount = aggregatedRecordCount ?? recordCount;
  const isAggregated = aggregatedRecordCount !== undefined && aggregatedRecordCount !== recordCount;
  const hasFilter = filteredCount != null;

  // Build tooltip for record count badge (includes coverage info)
  const countTooltipLines: string[] = [];
  if (hasFilter) {
    countTooltipLines.push(`${filteredCount} of ${displayCount} matching filter`);
  }
  countTooltipLines.push(
    isAggregated
      ? `${displayCount} records across all child topics`
      : `${displayCount} records assigned to this topic`
  );
  if (coveragePercentage !== undefined) {
    countTooltipLines.push(`Coverage: ${coveragePercentage.toFixed(1)}% of dataset`);
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5",
        isExpanded && "border-b border-border"
      )}
      style={{ height: HEADER_HEIGHT }}
    >
      {/* Title — formatted name with inline editing */}
      <div
        className="flex-1 min-w-0"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="font-semibold text-sm w-full bg-transparent border-b border-[rgb(var(--theme-500))] outline-none text-foreground nodrag"
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    onDoubleClick={handleStartEditing}
                    className={cn(
                      "font-semibold text-sm transition-colors truncate block text-left",
                      isRoot
                        ? "text-[rgb(var(--theme-500))]"
                        : "text-foreground",
                      canRename && "cursor-text"
                    )}
                  >
                    {formattedDisplayName}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs font-mono">{displayName}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {canRename && isHovered && (
              <button
                type="button"
                onClick={handleStartEditing}
                className="p-0.5 rounded hover:bg-muted transition-colors nodrag"
                title="Rename topic"
              >
                <Pencil className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Record count badge (right-aligned) — with coverage info in tooltip */}
      {!isEditing && !isEmptyRoot && displayCount > 0 && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-md text-[10px] tabular-nums font-semibold text-muted-foreground/70 border border-border/60 cursor-help shrink-0">
                {hasFilter ? `${filteredCount}/${displayCount}` : displayCount}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div className="text-xs space-y-0.5">
                {countTooltipLines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {isEmptyRoot && (
        <span className="text-[10px] text-muted-foreground/60 shrink-0">All assigned</span>
      )}
    </div>
  );
}

export { HEADER_HEIGHT };
