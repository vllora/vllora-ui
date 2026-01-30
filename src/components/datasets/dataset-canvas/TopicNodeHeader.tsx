/**
 * TopicNodeHeader
 *
 * Header section for TopicNodeComponent displaying icon, name, record count, and view records button.
 * Supports inline renaming on double-click (non-root nodes only).
 */

import { useState, useRef, useEffect } from "react";
import { Table2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CoverageIndicator } from "./CoverageIndicator";
import { ViewRecordsButton } from "./ViewRecordsButton";

interface TopicNodeHeaderProps {
  name: string;
  recordCount: number;
  /** For parent nodes: aggregated count of all descendants (used for coverage calculation) */
  aggregatedRecordCount?: number;
  isRoot: boolean;
  isExpanded: boolean;
  /** Coverage percentage from coverageStats (0-100) */
  coveragePercentage?: number;
  onViewRecords: () => void;
  /** Called when the topic is renamed. Only available for non-root nodes. */
  onRename?: (newName: string) => void;
}

const HEADER_HEIGHT = 60;

export function TopicNodeHeader({
  name,
  recordCount,
  aggregatedRecordCount,
  isRoot,
  isExpanded,
  coveragePercentage,
  onViewRecords,
  onRename,
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

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2",
        isExpanded && "border-b border-border"
      )}
      style={{ height: HEADER_HEIGHT }}
    >
      {/* Icon */}
      <div
        className={cn(
          "w-5 h-5 rounded flex items-center justify-center flex-shrink-0",
          isRoot
            ? "bg-[rgb(var(--theme-500))]/15 text-[rgb(var(--theme-500))]"
            : "bg-muted text-muted-foreground"
        )}
      >
        <Table2 className="w-3 h-3" />
      </div>

      {/* Title - with inline editing */}
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
          <div className="flex items-center gap-1.5 group">
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
                    {displayName}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {displayName}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {/* Edit icon on hover */}
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
        {!isExpanded && !isEditing && (
          (() => {
            if (isEmptyRoot) {
              return <p className="text-xs text-muted-foreground">All records assigned</p>;
            }
            // For parent nodes, show aggregated count with tooltip; for leaf nodes, show direct count
            const isAggregated = aggregatedRecordCount !== undefined && aggregatedRecordCount !== recordCount;
            const displayCount = aggregatedRecordCount ?? recordCount;
            const countText = `${displayCount.toLocaleString()} record${displayCount !== 1 ? "s" : ""}`;

            const tooltipText = isAggregated
              ? "Total records across all child topics"
              : "Records assigned to this topic";

            return (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-xs text-muted-foreground cursor-help">{countText}</p>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">{tooltipText}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })()
        )}
      </div>

      {/* Coverage indicator - show in both expanded and collapsed states */}
      {coveragePercentage !== undefined && !isEmptyRoot && !isRoot && (
        <CoverageIndicator
          coveragePercentage={coveragePercentage}
          recordCount={aggregatedRecordCount ?? recordCount}
        />
      )}

      {/* View records button - show when there are records (direct or aggregated) */}
      {(recordCount > 0 || (aggregatedRecordCount ?? 0) > 0) && (
        <ViewRecordsButton onViewRecords={onViewRecords} />
      )}
    </div>
  );
}

export { HEADER_HEIGHT };
