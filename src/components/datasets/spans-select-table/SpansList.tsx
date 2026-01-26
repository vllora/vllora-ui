/**
 * SpansList
 *
 * Virtualized list component for displaying and selecting spans.
 * Supports expandable rows, selection, and virtual scrolling.
 */

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { Span } from "@/types/common-type";
import { useVirtualizer } from "@tanstack/react-virtual";
import { extractDataInfoFromSpan } from "@/utils/modelUtils";
import { cn } from "@/lib/utils";
import { SelectionCheckbox, FormattedThreadPanel } from "../records-table/cells";
import { SpanRow } from "./SpanRow";
import { SelectionBanner } from "./SelectionBanner";

const ROW_HEIGHT = 100;

export interface SpansListProps {
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  filteredSpans: Span[];
  selectedSpanIds: Set<string>;
  totalCount: number;
  isAllMatchingSelected: boolean;
  onRetry: () => void;
  onToggleSelectAll: () => void;
  onSelectAllMatching: () => void;
  onClearSelection: () => void;
  onToggleSpanSelection: (spanId: string) => void;
  formatTime: (microseconds: number) => string;
}

export function SpansList({
  isLoading,
  error,
  searchQuery,
  filteredSpans,
  selectedSpanIds,
  totalCount,
  isAllMatchingSelected,
  onRetry,
  onToggleSelectAll,
  onSelectAllMatching,
  onClearSelection,
  onToggleSpanSelection,
  formatTime,
}: SpansListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [expandedSpanIds, setExpandedSpanIds] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((spanId: string) => {
    setExpandedSpanIds((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) {
        next.delete(spanId);
      } else {
        next.add(spanId);
      }
      return next;
    });
  }, []);

  const virtualizer = useVirtualizer({
    count: filteredSpans.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  if (isLoading) {
    return (
      <div className="h-full border border-border rounded-lg bg-card flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full border border-border rounded-lg bg-card flex flex-col items-center justify-center">
        <p className="text-destructive mb-4">{error}</p>
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (filteredSpans.length === 0) {
    return (
      <div className="h-full border border-border rounded-lg bg-card flex items-center justify-center text-muted-foreground">
        {searchQuery ? "No spans match your search." : "No spans found."}
      </div>
    );
  }

  return (
    <div className="h-full max-w-full border border-border rounded-lg bg-card overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center px-3 py-3 border-b border-border bg-muted/30 flex-shrink-0">
        <div className="w-6 shrink-0" /> {/* Spacer for expand button */}
        <div className="w-6 shrink-0 flex justify-center">
          <SelectionCheckbox
            checked={selectedSpanIds.size === filteredSpans.length && filteredSpans.length > 0}
            onChange={onToggleSelectAll}
          />
        </div>
        <span className="text-sm font-medium flex-[3] min-w-0 px-2">Message Preview</span>
        <span className="text-sm font-medium flex-1 min-w-0 px-2 text-center">Stats</span>
        <span className="text-sm font-medium flex-1 min-w-0 px-2 text-center">Label</span>
        <span className="text-sm font-medium flex-1 min-w-0 px-2 text-center">Provider</span>
        <span className="text-sm font-medium flex-1 min-w-0 px-2 text-center">Span ID</span>
        <span className="text-sm font-medium flex-1 min-w-0 px-2 text-right">Time</span>
      </div>

      {/* Gmail-style selection banner */}
      <SelectionBanner
        selectedCount={selectedSpanIds.size}
        pageCount={filteredSpans.length}
        totalCount={totalCount}
        isAllMatchingSelected={isAllMatchingSelected}
        onSelectAllMatching={onSelectAllMatching}
        onClearSelection={onClearSelection}
      />

      {/* Virtualized rows */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const span = filteredSpans[virtualRow.index];
            const dataInfo = extractDataInfoFromSpan(span);
            const isExpanded = expandedSpanIds.has(span.span_id);

            return (
              <div
                key={span.span_id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={cn(
                  "flex flex-col border-b border-border",
                  isExpanded && "border-border/60 shadow-md"
                )}
              >
                {/* Main row */}
                <SpanRow
                  span={span}
                  dataInfo={dataInfo}
                  isExpanded={isExpanded}
                  isSelected={selectedSpanIds.has(span.span_id)}
                  onToggleExpand={() => toggleExpand(span.span_id)}
                  onToggleSelection={() => onToggleSpanSelection(span.span_id)}
                  formatTime={formatTime}
                />

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="bg-zinc-900/40 border-t border-border/30">
                    <div className="p-4">
                      <FormattedThreadPanel data={dataInfo} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
