/**
 * SpanRow
 *
 * Row component for displaying a single span in the SpansList.
 * Includes expand toggle, selection checkbox, and data cells.
 */

import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConversationThreadCell, SelectionCheckbox, StatsBadge } from "../records-table/cells";
import { LabelTag } from "@/components/chat/traces/TraceRow/new-timeline/timeline-row/label-tag";
import { SpanIdCell } from "./SpanIdCell";
import type { DataInfo } from "@/types/dataset-types";
import type { Span } from "@/types/common-type";

export interface SpanRowProps {
  span: Span;
  dataInfo: DataInfo;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelection: () => void;
  formatTime: (microseconds: number) => string;
}

export function SpanRow({
  span,
  dataInfo,
  isExpanded,
  isSelected,
  onToggleExpand,
  onToggleSelection,
  formatTime,
}: SpanRowProps) {
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
      {/* Expand/Collapse toggle */}
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

      <div className="w-6 shrink-0 flex justify-center">
        <SelectionCheckbox
          checked={isSelected}
          onChange={onToggleSelection}
        />
      </div>
      <div className="flex-[3] min-w-0 px-2">
        <ConversationThreadCell data={dataInfo} />
      </div>
      <div className="flex-1 min-w-0 px-2 flex items-center justify-center">
        <StatsBadge data={dataInfo} />
      </div>
      <div className="flex-1 min-w-0 px-2 flex items-center justify-center">
        {span.attribute && 'label' in span.attribute && span.attribute.label ? (
          <LabelTag label={span.attribute.label} maxWidth={100} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      <div className="flex-1 min-w-0 px-2 flex items-center justify-center">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-muted text-xs font-medium truncate">
          {span.operation_name}
        </span>
      </div>
      <div className="flex-1 min-w-0 px-2 flex items-center justify-center">
        <SpanIdCell spanId={span.span_id} />
      </div>
      <div className="flex-1 min-w-0 px-2 flex items-center justify-end text-sm text-muted-foreground">
        {formatTime(span.start_time_us)}
      </div>
    </div>
  );
}
