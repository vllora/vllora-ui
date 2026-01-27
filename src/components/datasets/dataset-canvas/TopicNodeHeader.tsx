/**
 * TopicNodeHeader
 *
 * Header section for TopicNodeComponent displaying icon, name, record count, and expand/collapse button.
 * Supports inline renaming on double-click (non-root nodes only).
 */

import { useState, useRef, useEffect } from "react";
import { Table2, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopicNodeHeaderProps {
  name: string;
  recordCount: number;
  isRoot: boolean;
  isExpanded: boolean;
  onToggleExpansion: () => void;
  /** Called when the topic is renamed. Only available for non-root nodes. */
  onRename?: (newName: string) => void;
}

const HEADER_HEIGHT = 60;

export function TopicNodeHeader({
  name,
  recordCount,
  isRoot,
  isExpanded,
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
