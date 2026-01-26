/**
 * DataInfoRow
 *
 * Shared row component for displaying DataInfo records.
 * Used by both SpansSelectTable and UploadedRecordsList.
 */

import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConversationThreadCell, SelectionCheckbox, StatsBadge } from "../records-table/cells";
import type { DataInfo } from "@/types/dataset-types";

export interface DataInfoRowProps {
  id: string;
  index: number;
  data: DataInfo;
  isExpanded?: boolean;
  isSelected: boolean;
  showExpandToggle?: boolean;
  onToggleExpand?: () => void;
  onToggleSelection: () => void;
}

export function DataInfoRow({
  id: _id,
  index,
  data,
  isExpanded = false,
  isSelected,
  showExpandToggle = false,
  onToggleExpand,
  onToggleSelection,
}: DataInfoRowProps) {
  return (
    <div
      className={cn(
        "flex items-center px-3 py-2 cursor-pointer transition-colors",
        !isExpanded && "hover:bg-muted/20",
        isSelected && "bg-[rgb(var(--theme-500))]/5",
        isExpanded && "bg-zinc-800/50"
      )}
      onClick={onToggleSelection}
    >
      {/* Expand/Collapse toggle (optional) */}
      {showExpandToggle && onToggleExpand ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="w-6 h-6 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      ) : (
        <div className="w-6 shrink-0" /> // Spacer when no expand toggle
      )}

      {/* Selection checkbox */}
      <div className="w-6 shrink-0 flex justify-center">
        <SelectionCheckbox
          checked={isSelected}
          onChange={onToggleSelection}
        />
      </div>

      {/* Message Preview */}
      <div className="flex-[3] min-w-0 px-2">
        <ConversationThreadCell data={data} />
      </div>

      {/* Stats */}
      <div className="flex-1 min-w-0 px-2 flex items-center justify-center">
        <StatsBadge data={data} />
      </div>

      {/* Row number */}
      <div className="w-20 text-right text-xs text-muted-foreground pr-2">
        Row {index + 1}
      </div>
    </div>
  );
}
