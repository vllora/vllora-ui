/**
 * RecordsTable
 *
 * Virtualized table for displaying dataset records with selection support.
 * Uses @tanstack/react-virtual for efficient rendering of large lists.
 */

import { useRef, useState, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DatasetRecord } from "@/types/dataset-types";
import { Loader2, ArrowRight, ArrowUp, ArrowDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { RecordRow } from "./RecordRow";
import type { SortConfig, SortField } from "./RecordsToolbar";

interface RecordsTableProps {
  records: DatasetRecord[];
  isLoading?: boolean;
  emptyMessage?: string;
  /** Show table header with column titles */
  showHeader?: boolean;
  /** Show table footer with summary */
  showFooter?: boolean;
  /** Maximum records to display (0 = all) */
  maxRecords?: number;
  /** Show "See all X records" link when truncated */
  onSeeAll?: () => void;
  /** Handler for updating record topic */
  onUpdateTopic: (recordId: string, topic: string) => Promise<void>;
  /** Handler for deleting a record */
  onDelete: (recordId: string) => void;
  /** Show "Topic:" label prefix in each row */
  showTopicLabel?: boolean;
  /** Height of the table container for virtualization */
  height?: number;
  /** Enable selection mode */
  selectable?: boolean;
  /** Selected record IDs (controlled) */
  selectedIds?: Set<string>;
  /** Selection change handler (controlled) */
  onSelectionChange?: (selectedIds: Set<string>) => void;
  /** Current sort configuration */
  sortConfig?: SortConfig;
  /** Sort change handler */
  onSortChange?: (config: SortConfig) => void;
  /** Callback when expand is clicked */
  onExpand?: (record: DatasetRecord) => void;
}

const ROW_HEIGHT = 72; // Height of each row in pixels (increased for expand link)
const VIRTUALIZATION_THRESHOLD = 15; // Only virtualize if more than this many records

export function RecordsTable({
  records,
  isLoading = false,
  emptyMessage = "No records in this dataset",
  showHeader = false,
  showFooter = false,
  maxRecords = 0,
  onSeeAll,
  onUpdateTopic,
  onDelete,
  showTopicLabel = false,
  height = 400,
  selectable = false,
  selectedIds: controlledSelectedIds,
  onSelectionChange,
  sortConfig,
  onSortChange,
  onExpand,
}: RecordsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Internal selection state (used when not controlled)
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());

  // Use controlled or internal state
  const selectedIds = controlledSelectedIds ?? internalSelectedIds;
  const setSelectedIds = onSelectionChange ?? setInternalSelectedIds;

  const displayRecords = maxRecords > 0 ? records.slice(0, maxRecords) : records;
  const hasMore = maxRecords > 0 && records.length > maxRecords;
  const shouldVirtualize = displayRecords.length > VIRTUALIZATION_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: displayRecords.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  // Selection handlers
  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(displayRecords.map((r) => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, [displayRecords, setSelectedIds]);

  const handleSelectRecord = useCallback((recordId: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(recordId);
    } else {
      newSelected.delete(recordId);
    }
    setSelectedIds(newSelected);
  }, [selectedIds, setSelectedIds]);

  const allSelected = displayRecords.length > 0 && displayRecords.every((r) => selectedIds.has(r.id));
  const someSelected = displayRecords.some((r) => selectedIds.has(r.id));

  if (isLoading) {
    return (
      <div className="px-4 py-4 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading records...
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground italic text-center">
        {emptyMessage}
      </div>
    );
  }

  // Non-virtualized rendering for small lists
  if (!shouldVirtualize) {
    return (
      <>
        {showHeader && (
          <TableHeader
            selectable={selectable}
            allSelected={allSelected}
            someSelected={someSelected}
            onSelectAll={handleSelectAll}
            sortConfig={sortConfig}
            onSortChange={onSortChange}
          />
        )}
        <div>
          {displayRecords.map((record) => (
            <RecordRow
              key={record.id}
              record={record}
              onUpdateTopic={onUpdateTopic}
              onDelete={onDelete}
              tableLayout={showHeader}
              showTopicLabel={showTopicLabel}
              selectable={selectable}
              selected={selectedIds.has(record.id)}
              onSelect={(checked) => handleSelectRecord(record.id, checked)}
              onExpand={onExpand}
            />
          ))}
          {hasMore && onSeeAll && <SeeAllLink count={records.length} onClick={onSeeAll} />}
        </div>
        {showFooter && <TableFooter records={displayRecords} selectedCount={selectedIds.size} />}
      </>
    );
  }

  // Virtualized rendering for large lists
  return (
    <>
      {showHeader && (
        <TableHeader
          selectable={selectable}
          allSelected={allSelected}
          someSelected={someSelected}
          onSelectAll={handleSelectAll}
          sortConfig={sortConfig}
          onSortChange={onSortChange}
        />
      )}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const record = displayRecords[virtualRow.index];
            return (
              <div
                key={record.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <RecordRow
                  record={record}
                  onUpdateTopic={onUpdateTopic}
                  onDelete={onDelete}
                  tableLayout={showHeader}
                  showTopicLabel={showTopicLabel}
                  selectable={selectable}
                  selected={selectedIds.has(record.id)}
                  onSelect={(checked) => handleSelectRecord(record.id, checked)}
                  onExpand={onExpand}
                />
              </div>
            );
          })}
        </div>
      </div>
      {hasMore && onSeeAll && <SeeAllLink count={records.length} onClick={onSeeAll} />}
      {showFooter && <TableFooter records={displayRecords} selectedCount={selectedIds.size} />}
    </>
  );
}

interface TableHeaderProps {
  selectable?: boolean;
  allSelected?: boolean;
  someSelected?: boolean;
  onSelectAll?: (checked: boolean) => void;
  sortConfig?: SortConfig;
  onSortChange?: (config: SortConfig) => void;
}

function TableHeader({ selectable, allSelected, someSelected, onSelectAll, sortConfig, onSortChange }: TableHeaderProps) {
  const handleSort = (field: SortField) => {
    if (!onSortChange) return;

    if (sortConfig?.field === field) {
      // Toggle direction if same field
      onSortChange({
        field,
        direction: sortConfig.direction === "asc" ? "desc" : "asc",
      });
    } else {
      // Default to descending for new field
      onSortChange({ field, direction: "desc" });
    }
  };

  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortConfig?.field !== field) return null;
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="w-3 h-3 inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 inline ml-1" />
    );
  };

  return (
    <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
      {selectable && (
        <div className="w-6 shrink-0">
          <Checkbox
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(checked) => onSelectAll?.(checked === true)}
            className="border-muted-foreground/30"
          />
        </div>
      )}
      <span className="flex-[2]">Trace Data (Input/Output)</span>
      <span className="w-24 text-center">Source</span>
      <button
        className={cn(
          "w-24 text-center hover:text-foreground transition-colors",
          sortConfig?.field === "topic" && "text-foreground"
        )}
        onClick={() => handleSort("topic")}
      >
        Topic
        <SortIndicator field="topic" />
      </button>
      <button
        className={cn(
          "w-28 text-center hover:text-foreground transition-colors",
          sortConfig?.field === "evaluation" && "text-foreground"
        )}
        onClick={() => handleSort("evaluation")}
      >
        Evaluation
        <SortIndicator field="evaluation" />
      </button>
      <button
        className={cn(
          "w-36 text-right hover:text-foreground transition-colors",
          sortConfig?.field === "timestamp" && "text-foreground"
        )}
        onClick={() => handleSort("timestamp")}
      >
        Timestamp
        <SortIndicator field="timestamp" />
      </button>
      <span className="w-7"></span>
    </div>
  );
}

function SeeAllLink({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <div className="px-4 py-3 flex justify-end">
      <button
        className="text-sm text-[rgb(var(--theme-500))] hover:text-[rgb(var(--theme-400))] flex items-center gap-1 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        See all {count} records
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

interface TableFooterProps {
  records: DatasetRecord[];
  selectedCount?: number;
}

function TableFooter({ records, selectedCount = 0 }: TableFooterProps) {
  // Calculate summary stats
  const totalRecords = records.length;
  const fromSpans = records.filter((r) => r.spanId).length;
  const withTopic = records.filter((r) => r.topic).length;
  const withEvaluation = records.filter((r) => r.evaluation?.score !== undefined).length;

  // Get unique topics
  const topics = new Map<string, number>();
  records.forEach((r) => {
    if (r.topic) {
      topics.set(r.topic, (topics.get(r.topic) || 0) + 1);
    }
  });
  const topicCount = topics.size;

  return (
    <div className="px-4 py-2 bg-muted/30 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        {selectedCount > 0 && (
          <>
            <span className="text-[rgb(var(--theme-500))] font-medium">
              {selectedCount} selected
            </span>
            <span className="text-border">•</span>
          </>
        )}
        <span>
          <span className="font-medium text-foreground">{totalRecords}</span> records
        </span>
        <span className="text-border">•</span>
        <span>
          <span className="font-medium text-foreground">{fromSpans}</span> from spans
        </span>
        <span className="text-border">•</span>
        <span>
          <span className="font-medium text-foreground">{topicCount}</span> topics
        </span>
        <span className="text-border">•</span>
        <span>
          <span className="font-medium text-foreground">{withTopic}</span> labeled
        </span>
        <span className="text-border">•</span>
        <span>
          <span className="font-medium text-foreground">{withEvaluation}</span> evaluated
        </span>
      </div>
    </div>
  );
}
