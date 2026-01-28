/**
 * TopicNodeHeader
 *
 * Header section for TopicNodeComponent displaying icon, name, record count, and expand/collapse button.
 * Supports inline renaming on double-click (non-root nodes only).
 */

import { useState, useRef, useEffect } from "react";
import { Table2, ChevronDown, ChevronUp, Pencil } from "lucide-react";
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
  isRoot: boolean;
  isExpanded: boolean;
  /** Coverage percentage from coverageStats (0-100) */
  coveragePercentage?: number;
  onToggleExpansion: () => void;
  /** Called when the topic is renamed. Only available for non-root nodes. */
  onRename?: (newName: string) => void;
}

// Minimum record thresholds for training viability
// Coverage indicator should consider BOTH percentage and absolute count
const MIN_RECORDS_GREEN = 50;   // Need 50+ records for "good" coverage
const MIN_RECORDS_YELLOW = 20;  // 20-50 records is "medium"
const MIN_RECORDS_ORANGE = 10;  // 10-20 records is "low"
// < 10 records is "critical" regardless of percentage

/**
 * Get coverage indicator color based on both percentage AND absolute count.
 * Even if a topic has 100% of records, if it's only 1 record, that's not healthy.
 */
function getCoverageColor(percentage: number, absoluteCount: number): string {
  // Determine color based on percentage
  const percentageColor = percentage >= 20 ? 'green' :
                          percentage >= 10 ? 'yellow' :
                          percentage >= 5 ? 'orange' : 'red';

  // Determine color based on absolute count
  const countColor = absoluteCount >= MIN_RECORDS_GREEN ? 'green' :
                     absoluteCount >= MIN_RECORDS_YELLOW ? 'yellow' :
                     absoluteCount >= MIN_RECORDS_ORANGE ? 'orange' : 'red';

  // Use the worse of the two (more conservative/cautious)
  const colorOrder = ['red', 'orange', 'yellow', 'green'];
  const worstIndex = Math.min(colorOrder.indexOf(percentageColor), colorOrder.indexOf(countColor));

  return colorOrder[worstIndex];
}

function getCoverageColorClass(color: string, type: 'bg' | 'text'): string {
  const colorMap: Record<string, { bg: string; text: string }> = {
    green: { bg: 'bg-emerald-500', text: 'text-emerald-500' },
    yellow: { bg: 'bg-yellow-500', text: 'text-yellow-500' },
    orange: { bg: 'bg-orange-500', text: 'text-orange-500' },
    red: { bg: 'bg-red-500', text: 'text-red-500' },
  };
  return colorMap[color]?.[type] ?? colorMap.red[type];
}

/**
 * Generate tooltip content explaining coverage status
 */
function getCoverageTooltip(color: string, percentage: number, count: number): { status: string; explanation: string; suggestion: string } {
  const statusMap: Record<string, string> = {
    green: 'Good coverage',
    yellow: 'Medium coverage',
    orange: 'Low coverage',
    red: 'Critical - insufficient for training',
  };

  // Check which threshold is limiting
  const percentageColor = percentage >= 20 ? 'green' : percentage >= 10 ? 'yellow' : percentage >= 5 ? 'orange' : 'red';
  const countColor = count >= MIN_RECORDS_GREEN ? 'green' : count >= MIN_RECORDS_YELLOW ? 'yellow' : count >= MIN_RECORDS_ORANGE ? 'orange' : 'red';

  let explanation = `${count} records (${percentage.toFixed(1)}% of dataset)`;
  let suggestion = '';

  if (color === 'green') {
    suggestion = 'Ready for training';
  } else if (countColor !== 'green' && percentageColor === 'green') {
    // Count is the limiting factor
    const needed = color === 'red' ? MIN_RECORDS_ORANGE : color === 'orange' ? MIN_RECORDS_YELLOW : MIN_RECORDS_GREEN;
    suggestion = `Need ${needed - count} more records`;
  } else if (percentageColor !== 'green' && countColor === 'green') {
    // Percentage is the limiting factor (other topics have too many)
    suggestion = 'Other topics are over-represented';
  } else {
    // Both are limiting
    const neededCount = color === 'red' ? MIN_RECORDS_ORANGE : color === 'orange' ? MIN_RECORDS_YELLOW : MIN_RECORDS_GREEN;
    suggestion = `Need ${Math.max(0, neededCount - count)} more records`;
  }

  return {
    status: statusMap[color] || 'Unknown',
    explanation,
    suggestion,
  };
}

const HEADER_HEIGHT = 60;

export function TopicNodeHeader({
  name,
  recordCount,
  isRoot,
  isExpanded,
  coveragePercentage,
  onToggleExpansion,
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
        "flex items-center gap-3 px-4 py-3",
        isExpanded && "border-b border-border"
      )}
      style={{ height: HEADER_HEIGHT }}
    >
      {/* Icon */}
      <div
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
          isRoot
            ? "bg-[rgb(var(--theme-500))]/15 text-[rgb(var(--theme-500))]"
            : "bg-muted text-muted-foreground"
        )}
      >
        <Table2 className="w-4 h-4" />
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
          <p className="text-xs text-muted-foreground">
            {isEmptyRoot
              ? "All records assigned"
              : `${recordCount.toLocaleString()} record${recordCount !== 1 ? "s" : ""}`}
          </p>
        )}
      </div>

      {/* Coverage indicator - show in both expanded and collapsed states */}
      {coveragePercentage !== undefined && !isEmptyRoot && !isRoot && (() => {
        // Get color based on both percentage AND absolute count
        const coverageColor = getCoverageColor(coveragePercentage, recordCount);
        const tooltip = getCoverageTooltip(coverageColor, coveragePercentage, recordCount);
        return (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-help flex-shrink-0">
                  {/* Progress bar */}
                  <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        getCoverageColorClass(coverageColor, 'bg')
                      )}
                      style={{ width: `${Math.min(coveragePercentage * 5, 100)}%` }}
                    />
                  </div>
                  {/* Percentage text */}
                  <span className={cn(
                    "text-[10px] font-medium tabular-nums",
                    getCoverageColorClass(coverageColor, 'text')
                  )}>
                    {coveragePercentage.toFixed(1)}%
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[200px]">
                <div className="text-xs space-y-1">
                  <p className={cn("font-semibold", getCoverageColorClass(coverageColor, 'text'))}>
                    {tooltip.status}
                  </p>
                  <p className="text-muted-foreground">{tooltip.explanation}</p>
                  <p className="text-foreground">{tooltip.suggestion}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })()}

      {/* Expand/Collapse chevron - hide when no records */}
      {recordCount > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onToggleExpansion();
          }}
          className="flex-shrink-0 p-1 rounded-md hover:bg-muted transition-colors cursor-pointer nodrag text-muted-foreground hover:text-foreground"
          style={{ pointerEvents: 'auto' }}
          title={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      )}
    </div>
  );
}

export { HEADER_HEIGHT };
