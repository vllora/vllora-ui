/**
 * UploadedRecordsTable
 *
 * Virtualized table component for displaying uploaded JSONL records.
 * Uses shared components with SpansSelectTable for consistent styling.
 * Supports expandable rows to show full conversation details.
 */

import { useRef, useState, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ParsedJsonlRecord } from "@/utils/jsonl-parser";
import { cn } from "@/lib/utils";
import { SelectionCheckbox } from "../records-table/cells";
import { DataInfoRow, DataInfoExpandedDetail } from "../shared";

const ROW_HEIGHT = 80;

// Re-export the type for backwards compatibility
export type UploadedRecord = ParsedJsonlRecord;

export interface UploadedRecordsTableProps {
  records: UploadedRecord[];
  selectedIds: Set<string>;
  onToggleSelectAll: () => void;
  onToggleSelection: (id: string) => void;
  /** Offset for row numbering when paginated */
  pageOffset?: number;
}

export function UploadedRecordsTable({
  records,
  selectedIds,
  onToggleSelectAll,
  onToggleSelection,
  pageOffset = 0,
}: UploadedRecordsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  return (
    <div className="flex-1 border border-border rounded-lg bg-card overflow-hidden flex flex-col">
      {/* Header - matches SpansSelectTable style with Message Preview and Stats only */}
      <div className="flex items-center px-3 py-3 border-b border-border bg-muted/30 flex-shrink-0">
        <div className="w-6 shrink-0" /> {/* Spacer for expand button */}
        <div className="w-6 shrink-0 flex justify-center">
          <SelectionCheckbox
            checked={records.length > 0 && records.every((r) => selectedIds.has(r.id))}
            onChange={onToggleSelectAll}
          />
        </div>
        <span className="text-sm font-medium flex-[3] min-w-0 px-2">Message Preview</span>
        <span className="text-sm font-medium flex-1 min-w-0 px-2 text-center">Stats</span>
        <span className="text-sm font-medium w-20 text-right pr-2">Row</span>
      </div>

      {/* Virtualized rows */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const record = records[virtualRow.index];
            const isExpanded = expandedIds.has(record.id);

            return (
              <div
                key={record.id}
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
                <DataInfoRow
                  id={record.id}
                  index={pageOffset + virtualRow.index}
                  data={record.data}
                  isExpanded={isExpanded}
                  isSelected={selectedIds.has(record.id)}
                  showExpandToggle={true}
                  onToggleExpand={() => toggleExpand(record.id)}
                  onToggleSelection={() => onToggleSelection(record.id)}
                />

                {/* Expanded detail */}
                {isExpanded && (
                  <DataInfoExpandedDetail data={record.data} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
