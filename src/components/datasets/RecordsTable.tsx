/**
 * RecordsTable
 *
 * Virtualized table for displaying dataset records with selection support.
 * Uses @tanstack/react-virtual for efficient rendering of large lists.
 */

import { useRef, useState, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { Loader2, ChevronDown, ChevronRight, Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { RecordRow } from "./RecordRow";
import { TopicRecordTree } from "./TopicRecordTree";
import { RecordsTableHeader } from "./RecordsTableHeader";
import { RecordsTableFooter } from "./RecordsTableFooter";
import { SeeAllLink } from "./SeeAllLink";
import { getTopicColor, type AvailableTopic } from "./record-utils";

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
  onUpdateTopic: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  /** Handler for deleting a record */
  onDelete: (recordId: string) => void;
  /** Handler for saving record data changes */
  onSave?: (recordId: string, data: unknown) => Promise<void>;
  /** Height of the table container for virtualization. Use "auto" to fill available space */
  height?: number | "auto";
  /** Enable selection mode */
  selectable?: boolean;
  /** Selected record IDs (controlled) */
  selectedIds?: Set<string>;
  /** Selection change handler (controlled) */
  onSelectionChange?: (selectedIds: Set<string>) => void;
  /** Callback when expand is clicked */
  onExpand?: (record: DatasetRecord) => void;
  /** Group records by topic */
  groupByTopic?: boolean;
  /** Available topics from hierarchy for selection */
  availableTopics?: AvailableTopic[];
  /** Topic hierarchy for nested tree display */
  topicHierarchy?: TopicHierarchyNode[];
}

/** Represents a group of records by topic */
interface TopicGroup {
  topic: string;
  records: DatasetRecord[];
}

const ROW_HEIGHT = 118; // Base height of collapsed row in pixels (includes 8px gap)
const EXPANDED_ROW_HEIGHT = 428; // Approximate height when expanded (includes detail panel + gap)
const VIRTUALIZATION_THRESHOLD = 50; // Virtualize when more than this many records

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
  onSave,
  height = "auto",
  selectable = false,
  selectedIds: controlledSelectedIds,
  onSelectionChange,
  onExpand,
  groupByTopic = false,
  availableTopics = [],
  topicHierarchy,
}: RecordsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Internal selection state (used when not controlled)
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());

  // Collapsed groups state (tracks which topic groups are collapsed)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Expanded rows state (tracks which rows are expanded for virtualized list)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Use controlled or internal state
  const selectedIds = controlledSelectedIds ?? internalSelectedIds;
  const setSelectedIds = onSelectionChange ?? setInternalSelectedIds;

  const displayRecords = maxRecords > 0 ? records.slice(0, maxRecords) : records;
  const hasMore = maxRecords > 0 && records.length > maxRecords;
  const shouldVirtualize = displayRecords.length > VIRTUALIZATION_THRESHOLD && !groupByTopic;

  // Compute container style based on height prop
  const containerStyle = height === "auto" ? { height: "100%" } : { height };

  // Toggle row expansion (for virtualized list)
  const toggleRowExpansion = useCallback((recordId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  }, []);

  // Group records by topic
  const groupedRecords = useMemo((): TopicGroup[] => {
    if (!groupByTopic) return [];

    const groups = new Map<string, DatasetRecord[]>();
    const NO_TOPIC = "__no_topic__";

    for (const record of displayRecords) {
      const topicKey = record.topic || NO_TOPIC;
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
    estimateSize: (index) => {
      const record = displayRecords[index];
      return expandedRows.has(record.id) ? EXPANDED_ROW_HEIGHT : ROW_HEIGHT;
    },
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

  // Hierarchical tree rendering (when topic hierarchy is available)
  if (groupByTopic && topicHierarchy && topicHierarchy.length > 0) {
    return (
      <div className="flex flex-col" style={containerStyle}>
        {showHeader && (
          <RecordsTableHeader
            selectable={selectable}
            allSelected={allSelected}
            someSelected={someSelected}
            onSelectAll={handleSelectAll}
            hideTopic
          />
        )}
        <div className="flex-1 overflow-auto min-h-0">
          <TopicRecordTree
            hierarchy={topicHierarchy}
            records={displayRecords}
            onUpdateTopic={onUpdateTopic}
            onDelete={onDelete}
            onSave={onSave}
            selectable={selectable}
            selectedIds={selectedIds}
            onSelectRecord={handleSelectRecord}
            onExpand={onExpand}
            availableTopics={availableTopics}
          />
        </div>
        {hasMore && onSeeAll && <SeeAllLink onClick={onSeeAll} />}
        {showFooter && <RecordsTableFooter records={displayRecords} selectedCount={selectedIds.size} datasetId={datasetId} />}
      </div>
    );
  }

  // Flat grouped rendering by topic (fallback when no hierarchy)
  if (groupByTopic) {
    return (
      <div className="flex flex-col" style={containerStyle}>
        {showHeader && (
          <RecordsTableHeader
            selectable={selectable}
            allSelected={allSelected}
            someSelected={someSelected}
            onSelectAll={handleSelectAll}
            hideTopic
          />
        )}
        <div className="flex-1 overflow-auto">
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
                    <div className="p-2 space-y-2">
                      {group.records.map((record) => (
                        <RecordRow
                          key={record.id}
                          record={record}
                          onUpdateTopic={onUpdateTopic}
                          onDelete={onDelete}
                          onSave={onSave}
                          selectable={selectable}
                          selected={selectedIds.has(record.id)}
                          onSelect={(checked) => handleSelectRecord(record.id, checked)}
                          onExpand={onExpand}
                          availableTopics={availableTopics}
                          hideTopic
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
        {hasMore && onSeeAll && <SeeAllLink onClick={onSeeAll} />}
        {showFooter && <RecordsTableFooter records={displayRecords} selectedCount={selectedIds.size} datasetId={datasetId} />}
      </div>
    );
  }

  // Non-virtualized rendering for small lists
  if (!shouldVirtualize) {
    return (
      <div className="flex flex-col" style={containerStyle}>
        {showHeader && (
          <RecordsTableHeader
            selectable={selectable}
            allSelected={allSelected}
            someSelected={someSelected}
            onSelectAll={handleSelectAll}
          />
        )}
        <div className="flex-1 overflow-auto p-2 space-y-2">
          {displayRecords.map((record) => (
            <RecordRow
              key={record.id}
              record={record}
              onUpdateTopic={onUpdateTopic}
              onDelete={onDelete}
              onSave={onSave}
              selectable={selectable}
              selected={selectedIds.has(record.id)}
              onSelect={(checked) => handleSelectRecord(record.id, checked)}
              onExpand={onExpand}
              availableTopics={availableTopics}
            />
          ))}
          {hasMore && onSeeAll && <SeeAllLink onClick={onSeeAll} />}
        </div>
        {showFooter && <RecordsTableFooter records={displayRecords} selectedCount={selectedIds.size} datasetId={datasetId} />}
      </div>
    );
  }

  // Virtualized rendering for large lists with dynamic row heights
  return (
    <div className="flex flex-col" style={containerStyle}>
      {showHeader && (
        <RecordsTableHeader
          selectable={selectable}
          allSelected={allSelected}
          someSelected={someSelected}
          onSelectAll={handleSelectAll}
        />
      )}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto p-2"
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
            const isRowExpanded = expandedRows.has(record.id);
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
                  paddingBottom: "8px",
                }}
              >
                <RecordRow
                  record={record}
                  onUpdateTopic={onUpdateTopic}
                  onDelete={onDelete}
                  onSave={onSave}
                  selectable={selectable}
                  selected={selectedIds.has(record.id)}
                  onSelect={(checked) => handleSelectRecord(record.id, checked)}
                  onExpand={onExpand}
                  availableTopics={availableTopics}
                  isExpanded={isRowExpanded}
                  onToggleExpand={() => toggleRowExpansion(record.id)}
                />
              </div>
            );
          })}
        </div>
      </div>
      {hasMore && onSeeAll && <SeeAllLink onClick={onSeeAll} />}
      {showFooter && <RecordsTableFooter records={displayRecords} selectedCount={selectedIds.size} datasetId={datasetId} />}
    </div>
  );
}

