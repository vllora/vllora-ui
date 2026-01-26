/**
 * RecordsTableHeader
 *
 * Header row for the records table with column titles and select-all checkbox.
 */

import { useState } from "react";
import { Check, Minus, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLUMN_WIDTHS } from "../table-columns";
import { CoverageDistributionDialog } from "../CoverageDistributionDialog";
import { TopicHierarchyNode } from "@/types/dataset-types";

export interface RecordsTableHeaderProps {
  selectable?: boolean;
  allSelected?: boolean;
  someSelected?: boolean;
  onSelectAll?: (checked: boolean) => void;
  /** Hide topic column (used in grouped mode) */
  hideTopic?: boolean;
  /** Topic counts for distribution chart */
  topicCounts?: Record<string, number>;
  /** Total records for distribution calculation */
  totalRecords?: number;
  /** Whether topic hierarchy is configured */
  hasTopicHierarchy?: boolean;
  /** Topic hierarchy tree structure */
  topicHierarchy?: TopicHierarchyNode[];
}

export function RecordsTableHeader({
  selectable,
  allSelected,
  someSelected,
  onSelectAll,
  hideTopic,
  topicCounts,
  totalRecords = 0,
  hasTopicHierarchy,
  topicHierarchy,
}: RecordsTableHeaderProps) {
  const [distributionDialogOpen, setDistributionDialogOpen] = useState(false);
  const showDistributionIcon = hasTopicHierarchy && topicCounts && Object.keys(topicCounts).length > 0;

  return (
    <>
      <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {selectable && (
          <div
            className={cn("flex items-center justify-center", COLUMN_WIDTHS.checkbox)}
            onClick={() => onSelectAll?.(!allSelected)}
          >
            <div
              className={cn(
                "h-4 w-4 rounded flex items-center justify-center cursor-pointer transition-all duration-150",
                "border",
                allSelected
                  ? "bg-[rgb(var(--theme-500))] border-[rgb(var(--theme-500))]"
                  : someSelected
                    ? "bg-[rgb(var(--theme-500))]/50 border-[rgb(var(--theme-500))]"
                    : "bg-transparent border-muted-foreground/50 hover:border-muted-foreground"
              )}
            >
              {allSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
              {!allSelected && someSelected && <Minus className="h-3 w-3 text-white" strokeWidth={3} />}
            </div>
          </div>
        )}
        <span className={COLUMN_WIDTHS.thread}>Data</span>
        <span className={cn(COLUMN_WIDTHS.tools, "text-center")}>Tools</span>
        {!hideTopic && (
          <span className={cn(COLUMN_WIDTHS.strategy, "text-center flex items-center justify-center gap-1")}>
            Topic
            {showDistributionIcon && (
              <button
                className="p-0.5 rounded hover:bg-muted transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setDistributionDialogOpen(true);
                }}
              >
                <BarChart3 className="h-3 w-3" />
              </button>
            )}
          </span>
        )}
        <span className={cn(COLUMN_WIDTHS.stats, "text-center")}>Stats</span>
        <span className={COLUMN_WIDTHS.deepDiveActions}>Actions</span>
      </div>

      {/* Coverage Distribution Dialog */}
      {showDistributionIcon && topicCounts && (
        <CoverageDistributionDialog
          open={distributionDialogOpen}
          onOpenChange={setDistributionDialogOpen}
          topicCounts={topicCounts}
          totalRecords={totalRecords}
          topicHierarchy={topicHierarchy}
        />
      )}
    </>
  );
}
