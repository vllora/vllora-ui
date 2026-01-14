/**
 * RecordsTable
 *
 * Virtualized table for displaying dataset records with selection support.
 * Uses @tanstack/react-virtual for efficient rendering of large lists.
 */

import { useRef, useState, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DatasetRecord } from "@/types/dataset-types";
import { Loader2, ArrowRight, ArrowUp, ArrowDown, ChevronDown, ChevronRight, Check, Minus, Copy, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { RecordRow } from "./RecordRow";
import { getTopicColor } from "./record-utils";
import type { SortConfig, SortField } from "./RecordsToolbar";

interface RecordsTableProps {
  records: DatasetRecord[];
  /** Dataset ID for display in footer */
  datasetId?: string;
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
  /** Group records by topic */
  groupByTopic?: boolean;
}

/** Represents a group of records by topic */
interface TopicGroup {
  topic: string;
  records: DatasetRecord[];
}

const ROW_HEIGHT = 72; // Height of each row in pixels (increased for expand link)
const VIRTUALIZATION_THRESHOLD = 15; // Only virtualize if more than this many records

export function RecordsTable({
  records,
  datasetId,
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
  groupByTopic = false,
}: RecordsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Internal selection state (used when not controlled)
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());

  // Collapsed groups state (tracks which topic groups are collapsed)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Use controlled or internal state
  const selectedIds = controlledSelectedIds ?? internalSelectedIds;
  const setSelectedIds = onSelectionChange ?? setInternalSelectedIds;

  const displayRecords = maxRecords > 0 ? records.slice(0, maxRecords) : records;
  const hasMore = maxRecords > 0 && records.length > maxRecords;
  const shouldVirtualize = displayRecords.length > VIRTUALIZATION_THRESHOLD && !groupByTopic;

  // Group records by topic
  const groupedRecords = useMemo((): TopicGroup[] => {
    if (!groupByTopic) return [];

    const groups = new Map<string, DatasetRecord[]>();
    const NO_TOPIC = "__no_topic__";

    for (const record of displayRecords) {
      const topicKey = record.topic_root || record.topic || NO_TOPIC;
      if (!groups.has(topicKey)) {
        groups.set(topicKey, []);
      }
      groups.get(topicKey)!.push(record);
    }

    // Sort groups: named topics first (alphabetically), then "No Topic"
    const sortedGroups: TopicGroup[] = [];
    const topicKeys = Array.from(groups.keys()).sort((a, b) => {
      if (a === NO_TOPIC) return 1;
      if (b === NO_TOPIC) return -1;
      return a.localeCompare(b);
    });

    for (const topic of topicKeys) {
      sortedGroups.push({
        topic: topic === NO_TOPIC ? "No Topic" : topic,
        records: groups.get(topic)!,
      });
    }

    return sortedGroups;
  }, [displayRecords, groupByTopic]);

  const toggleGroup = useCallback((topic: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) {
        next.delete(topic);
      } else {
        next.add(topic);
      }
      return next;
    });
  }, []);

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

  // Grouped rendering by topic
  if (groupByTopic) {
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
          className="overflow-auto"
          style={{ maxHeight: height }}
        >
          {groupedRecords.map((group) => {
            const isCollapsed = collapsedGroups.has(group.topic);
            const groupRecordIds = group.records.map((r) => r.id);
            const allGroupSelected = groupRecordIds.every((id) => selectedIds.has(id));
            const someGroupSelected = groupRecordIds.some((id) => selectedIds.has(id));

            return (
              <div key={group.topic} className="border-b border-border last:border-b-0">
                {/* Group Header */}
                <button
                  className="w-full px-4 py-3 flex items-center gap-3 bg-muted/50 hover:bg-muted/70 transition-colors text-left"
                  onClick={() => toggleGroup(group.topic)}
                >
                  {selectable && (
                    <div
                      className="flex items-center justify-center w-6 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Toggle selection for all records in group
                        const newSelected = new Set(selectedIds);
                        if (allGroupSelected) {
                          groupRecordIds.forEach((id) => newSelected.delete(id));
                        } else {
                          groupRecordIds.forEach((id) => newSelected.add(id));
                        }
                        setSelectedIds(newSelected);
                      }}
                    >
                      <div
                        className={cn(
                          "h-4 w-4 rounded flex items-center justify-center cursor-pointer transition-all duration-150",
                          "border",
                          allGroupSelected
                            ? "bg-[rgb(var(--theme-500))] border-[rgb(var(--theme-500))]"
                            : someGroupSelected
                              ? "bg-[rgb(var(--theme-500))]/50 border-[rgb(var(--theme-500))]"
                              : "bg-transparent border-muted-foreground/50 hover:border-muted-foreground"
                        )}
                      >
                        {allGroupSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                        {!allGroupSelected && someGroupSelected && <Minus className="h-3 w-3 text-white" strokeWidth={3} />}
                      </div>
                    </div>
                  )}
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  {group.topic === "No Topic" ? (
                    <span className="text-sm text-muted-foreground italic">
                      No Topic
                    </span>
                  ) : (
                    <span className={cn(
                      "text-sm font-bold px-2.5 py-1 rounded-full",
                      getTopicColor(group.topic)
                    )}>
                      {group.topic}
                    </span>
                  )}
                  <span className="text-sm text-muted-foreground">
                    ({group.records.length} record{group.records.length !== 1 ? "s" : ""})
                  </span>
                </button>

                {/* Group Records */}
                {!isCollapsed && (
                  <div>
                    {group.records.map((record) => (
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {hasMore && onSeeAll && <SeeAllLink onClick={onSeeAll} />}
        {showFooter && <TableFooter records={displayRecords} selectedCount={selectedIds.size} datasetId={datasetId} />}
      </>
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
          {hasMore && onSeeAll && <SeeAllLink onClick={onSeeAll} />}
        </div>
        {showFooter && <TableFooter records={displayRecords} selectedCount={selectedIds.size} datasetId={datasetId} />}
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
      {hasMore && onSeeAll && <SeeAllLink onClick={onSeeAll} />}
      {showFooter && <TableFooter records={displayRecords} selectedCount={selectedIds.size} datasetId={datasetId} />}
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
        <div
          className="flex items-center justify-center w-6 shrink-0"
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
      <span className="flex-[2] min-w-0">Trace Data (Input/Output)</span>
      <span className="w-24 text-center shrink-0">Source</span>
      <button
        className={cn(
          "w-28 text-center shrink-0 hover:text-foreground transition-colors",
          sortConfig?.field === "topic" && "text-foreground"
        )}
        onClick={() => handleSort("topic")}
      >
        Topic
        <SortIndicator field="topic" />
      </button>
      <button
        className={cn(
          "w-28 text-center shrink-0 hover:text-foreground transition-colors",
          sortConfig?.field === "evaluation" && "text-foreground"
        )}
        onClick={() => handleSort("evaluation")}
      >
        Evaluation
        <SortIndicator field="evaluation" />
      </button>
      <button
        className={cn(
          "w-36 text-right shrink-0 hover:text-foreground transition-colors",
          sortConfig?.field === "timestamp" && "text-foreground"
        )}
        onClick={() => handleSort("timestamp")}
      >
        Timestamp
        <SortIndicator field="timestamp" />
      </button>
      <span className="w-16 shrink-0"></span>
    </div>
  );
}

function SeeAllLink({ onClick }: { onClick: () => void }) {
  return (
    <div className="px-4 py-3 flex justify-end border-t border-border/50">
      <button
        className="text-sm text-[rgb(var(--theme-500))] hover:text-[rgb(var(--theme-400))] hover:underline flex items-center gap-1 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        See all
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface TableFooterProps {
  records: DatasetRecord[];
  selectedCount?: number;
  datasetId?: string;
}

function TableFooter({ records, selectedCount = 0, datasetId }: TableFooterProps) {
  const [copied, setCopied] = useState(false);

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

  const handleCopyId = async () => {
    if (!datasetId) return;
    try {
      await navigator.clipboard.writeText(datasetId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

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
      {datasetId && (
        <button
          onClick={handleCopyId}
          className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          title={`Copy dataset ID: ${datasetId}`}
        >
          <span>ID:</span>
          <span className="font-mono">
            {datasetId.length > 12
              ? `${datasetId.slice(0, 5)}...${datasetId.slice(-5)}`
              : datasetId}
          </span>
          {copied ? (
            <CheckCheck className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
