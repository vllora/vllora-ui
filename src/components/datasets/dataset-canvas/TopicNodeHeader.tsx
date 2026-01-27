/**
 * TopicNodeHeader
 *
 * Header section for TopicNodeComponent displaying icon, name, record count, and expand/collapse button.
 */

import { Table2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopicNodeHeaderProps {
  name: string;
  recordCount: number;
  isRoot: boolean;
  isExpanded: boolean;
  onToggleExpansion: () => void;
}

const HEADER_HEIGHT = 60;

export function TopicNodeHeader({
  name,
  recordCount,
  isRoot,
  isExpanded,
  onToggleExpansion,
}: TopicNodeHeaderProps) {
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

      {/* Title - draggable area */}
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            "font-semibold text-sm transition-colors truncate block text-left w-full",
            isRoot
              ? "text-[rgb(var(--theme-500))]"
              : "text-foreground"
          )}
        >
          {name}
        </span>
        {!isExpanded && (
          <p className="text-xs text-muted-foreground">
            {recordCount.toLocaleString()} record{recordCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Expand/Collapse chevron */}
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
    </div>
  );
}

export { HEADER_HEIGHT };
