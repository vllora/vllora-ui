/**
 * NoMatchingRecordsState
 *
 * Empty state component shown when no records match the current filters.
 * Used by SpansList and UploadedRecordsTable.
 */

import { Button } from "@/components/ui/button";
import { FilterX } from "lucide-react";

export interface NoMatchingRecordsStateProps {
  /** Title text */
  title?: string;
  /** Description text */
  description?: string;
  /** Total count to display (e.g., "0 of X total") */
  totalCount?: number;
  /** Label for total count (e.g., "traces", "records") */
  totalLabel?: string;
  /** Callback to clear filters */
  onClearFilters?: () => void;
  /** Text for the clear filters button */
  clearButtonText?: string;
}

export function NoMatchingRecordsState({
  title = "No records match your filters",
  description = "We couldn't find any records matching the current criteria. Try removing filters or adjusting the search to see more results.",
  totalCount,
  totalLabel = "records",
  onClearFilters,
  clearButtonText = "Clear All Filters",
}: NoMatchingRecordsStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      {/* Icon */}
      <div className="w-16 h-16 rounded-xl bg-zinc-800/80 flex items-center justify-center mb-6">
        <FilterX className="w-8 h-8 text-muted-foreground" />
      </div>

      {/* Title */}
      <h3 className="text-xl font-semibold text-foreground mb-2">
        {title}
      </h3>

      {/* Description */}
      <p className="text-muted-foreground text-center max-w-md mb-6">
        {description}
      </p>

      {/* Clear Filters Button */}
      {onClearFilters && (
        <Button
          onClick={onClearFilters}
          className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
        >
          <FilterX className="w-4 h-4" />
          {clearButtonText}
        </Button>
      )}

      {/* Stats */}
      {totalCount !== undefined && totalCount > 0 && (
        <div className="w-full max-w-md border-t border-border mt-8 pt-6">
          <p className="text-xs text-muted-foreground text-center uppercase tracking-wider">
            Matching: <span className="font-semibold text-foreground">0</span> of{" "}
            <span className="font-semibold text-foreground">{totalCount.toLocaleString()}</span> total {totalLabel}
          </p>
        </div>
      )}
    </div>
  );
}
