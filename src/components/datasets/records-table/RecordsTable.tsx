/**
 * RecordsTable
 *
 * Virtualized table for displaying dataset records with selection support.
 * Uses @tanstack/react-virtual for efficient rendering of large lists.
 */

import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { Loader2, ChevronDown, ChevronRight, Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { RecordRow } from "./RecordRow";
import { RecordsTableHeader } from "./RecordsTableHeader";
import { RecordsTableFooter } from "./RecordsTableFooter";
import { PromptInheritancePanel } from "./PromptInheritancePanel";
import { UnifiedRecordTable } from "./UnifiedRecordTable";
import { UnifiedTableToolbar } from "./UnifiedTableToolbar";
import { SeeAllLink } from "./SeeAllLink";
import { getTopicColor, type AvailableTopic } from "../record-utils";
import type { RecordRole } from "../record-filters";
import { emitter, consumePendingHighlight } from "@/utils/eventEmitter";
import { usePromptScrollTracking } from "@/hooks/usePromptScrollTracking";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { useJobScoreColumns } from "@/hooks/useJobScoreColumns";

interface RecordsTableProps {
  records: DatasetRecord[];
  /** Dataset ID for display in footer */
  workflowId?: string;
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
  /** ID of record currently being viewed in sidebar */
  viewingRecordId?: string | null;
  /** Group records by topic */
  groupByTopic?: boolean;
  /** Available topics from hierarchy for selection */
  availableTopics?: AvailableTopic[];
  /** Topic hierarchy for nested tree display */
  topicHierarchy?: TopicHierarchyNode[];
  /** Handler for deleting a topic */
  onDeleteTopic?: (topicName: string) => void;
  /** Handler for generating records for a topic */
  onGenerateForTopic?: (topicPath: string) => void;
  /** Handler for generating subtopics (null = root level) */
  onGenerateSubtopics?: (topicPath: string | null) => void;
  /** P0-9: Active role filter */
  roleFilter?: RecordRole;
  /** P0-9: Called when role filter changes */
  onRoleFilterChange?: (role: RecordRole) => void;
  /** Dataset training objective (for computing shared system prompts per topic) */
  datasetObjective?: string;
  /** LLM-normalized "You are ..." role sentence (cached on dataset) */
  normalizedObjective?: string;
  /** Handler for updating a topic's custom prompt template */
  onUpdatePromptTemplate?: (topicId: string, template: string | undefined) => void;
  /** Whether more records can be loaded from the server */
  hasMore?: boolean;
  /** Whether a page is currently loading */
  isLoadingMore?: boolean;
  /** Callback to load the next page of records */
  onLoadMore?: () => void;
  /** Total records count from server */
  totalRecordsFromServer?: number;
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
  workflowId,
  isLoading = false,
  emptyMessage: _emptyMessage = "No records in this workflow",
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
  viewingRecordId: _viewingRecordId,
  groupByTopic = false,
  availableTopics = [],
  topicHierarchy,
  onDeleteTopic: _onDeleteTopic,
  onGenerateForTopic: _onGenerateForTopic,
  onGenerateSubtopics: _onGenerateSubtopics,
  roleFilter,
  onRoleFilterChange,
  datasetObjective: _datasetObjective,
  normalizedObjective,
  onUpdatePromptTemplate: _onUpdatePromptTemplate,
  hasMore: hasMorePages,
  isLoadingMore,
  onLoadMore,
  totalRecordsFromServer,
}: RecordsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Internal selection state (used when not controlled)
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());

  // Collapsed groups state (tracks which topic groups are collapsed)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Expanded rows state (tracks which rows are expanded for virtualized list)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Highlighted record state (for scrolling to variant source)
  const [highlightedRecordId, setHighlightedRecordId] = useState<string | null>(null);

  // Prompt inheritance panel state — default to first leaf topic so panel shows immediately
  const firstLeafTopicId = useMemo(() => {
    if (!topicHierarchy || topicHierarchy.length === 0) return null;
    const findFirstLeaf = (nodes: TopicHierarchyNode[]): string | null => {
      for (const n of nodes) {
        if (n.children?.length) {
          const leaf = findFirstLeaf(n.children);
          if (leaf) return leaf;
        } else {
          return n.id || n.name;
        }
      }
      return null;
    };
    return findFirstLeaf(topicHierarchy);
  }, [topicHierarchy]);

  const [promptPanelTopicId, setPromptPanelTopicId] = useState<string | null>(null);

  // Open prompt panel by default when hierarchy is available
  useEffect(() => {
    if (firstLeafTopicId && promptPanelTopicId === null) {
      setPromptPanelTopicId(firstLeafTopicId);
    }
  }, [firstLeafTopicId, promptPanelTopicId]);

  // Scroll tracking for auto-updating prompt panel
  const { visibleTopicId, isAutoTracking } = usePromptScrollTracking({
    containerRef: parentRef,
    enabled: promptPanelTopicId !== null,
  });

  // Refs for record rows to enable scrolling
  const recordRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Ref to virtualizer for scrollToIndex from event handler
  const virtualizerRef = useRef<ReturnType<typeof useVirtualizer<HTMLDivElement, Element>> | null>(null);

  // Use controlled or internal state
  const selectedIds = controlledSelectedIds ?? internalSelectedIds;
  const setSelectedIds = onSelectionChange ?? setInternalSelectedIds;

  const displayRecords = maxRecords > 0 ? records.slice(0, maxRecords) : records;
  const hasMore = maxRecords > 0 && records.length > maxRecords;
  const shouldVirtualize = displayRecords.length > VIRTUALIZATION_THRESHOLD && !groupByTopic;

  // Highlight a record: set state, scroll into view, clear after animation
  const highlightRecord = useCallback((recordId: string) => {
    const recordIndex = displayRecords.findIndex(r => r.id === recordId);
    if (recordIndex < 0) return;

    setHighlightedRecordId(recordId);

    // Scroll: use virtualizer only when actually rendering virtualized rows
    // (not in groupByTopic/tree mode where TopicRecordTree renders instead)
    if (shouldVirtualize && virtualizerRef.current) {
      virtualizerRef.current.scrollToIndex(recordIndex, { align: 'center', behavior: 'smooth' });
    } else {
      // DOM-based scroll for tree/grouped/small list modes
      requestAnimationFrame(() => {
        const recordElement = recordRefs.current.get(recordId);
        if (recordElement) {
          recordElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }

    setTimeout(() => { setHighlightedRecordId(null); }, 2000);
  }, [displayRecords, shouldVirtualize]);

  // Listen for highlight record events (from variant source clicks / eval job detail)
  useEffect(() => {
    const handleHighlightRecord = ({ recordId }: { recordId: string }) => {
      highlightRecord(recordId);
    };

    emitter.on('vllora_highlight_record', handleHighlightRecord);

    // Check for pending highlight (set before tab switch, before this component mounted).
    // Use setTimeout to ensure record refs are populated after the first paint.
    const pendingId = consumePendingHighlight();
    if (pendingId) {
      setTimeout(() => { highlightRecord(pendingId); }, 100);
    }

    return () => {
      emitter.off('vllora_highlight_record', handleHighlightRecord);
    };
  }, [highlightRecord]);

  // Callback ref to store record element references
  const setRecordRef = useCallback((recordId: string) => (el: HTMLDivElement | null) => {
    if (el) {
      recordRefs.current.set(recordId, el);
    } else {
      recordRefs.current.delete(recordId);
    }
  }, []);

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
  virtualizerRef.current = virtualizer;

  // Infinite scroll: load more when user scrolls near the end
  useEffect(() => {
    if (!hasMorePages || isLoadingMore || !onLoadMore) return;
    const items = virtualizer.getVirtualItems();
    const lastItem = items[items.length - 1];
    if (!lastItem) return;
    // Trigger when within 5 rows of the end
    if (lastItem.index >= displayRecords.length - 5) {
      onLoadMore();
    }
  }, [virtualizer.getVirtualItems(), hasMorePages, isLoadingMore, onLoadMore, displayRecords.length]);

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

  const hasTopicHierarchy = topicHierarchy && topicHierarchy.length > 0;

  // Compute topic counts for distribution chart (includes all topics from hierarchy)
  const topicCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    // Initialize all topics from hierarchy with 0
    for (const topic of availableTopics) {
      counts[topic.name] = 0;
    }

    // Count records per topic
    for (const record of displayRecords) {
      if (record.topic && counts[record.topic] !== undefined) {
        counts[record.topic]++;
      }
    }

    return counts;
  }, [displayRecords, availableTopics]);

  if (isLoading) {
    return (
      <div className="px-4 py-4 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading records...
      </div>
    );
  }

  // Build prompt chain for the prompt inheritance panel
  const activePromptTopicId = isAutoTracking && visibleTopicId ? visibleTopicId : promptPanelTopicId;

  // Extract system prompt from the first record as fallback when normalizedObjective is not set
  const recordSystemPrompt = useMemo(() => {
    for (const record of displayRecords) {
      const d = record.data as Record<string, unknown> | undefined;
      const msgs = (Array.isArray(d?.messages) ? d.messages : (d?.input as Record<string, unknown> | undefined)?.messages) as Array<{ role?: string; content?: string }> | undefined;
      if (!msgs) continue;
      const sysMsg = msgs.find(m => m.role === "system");
      if (sysMsg?.content) return sysMsg.content;
    }
    return null;
  }, [displayRecords]);

  const promptChainData = useMemo(() => {
    if (!activePromptTopicId || !topicHierarchy) return null;

    // Walk hierarchy to find the path to the topic
    const findPath = (nodes: TopicHierarchyNode[], trail: TopicHierarchyNode[]): TopicHierarchyNode[] | null => {
      for (const node of nodes) {
        const nodeId = node.id || node.name;
        if (nodeId === activePromptTopicId || node.name === activePromptTopicId) {
          return [...trail, node];
        }
        if (node.children?.length) {
          const result = findPath(node.children, [...trail, node]);
          if (result) return result;
        }
      }
      return null;
    };

    const path = findPath(topicHierarchy, []);
    if (!path || path.length === 0) return null;

    const breadcrumb = path.map(n => n.name);

    // Build chain: root system prompt → parent topics → leaf topic
    const chain: { label: string; level: "root" | "parent" | "leaf"; prompt: string }[] = [];

    // Root: use normalizedObjective, or fall back to system prompt from record data
    const rootPrompt = normalizedObjective || recordSystemPrompt;
    if (rootPrompt) {
      chain.push({ label: "Root Prompt", level: "root", prompt: rootPrompt });
    }

    // Hierarchy nodes: parents → leaf
    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      const isLast = i === path.length - 1;
      chain.push({
        label: node.name,
        level: isLast ? "leaf" : "parent",
        prompt: node.description || node.normalizedPromptSegment || `Specialize in: ${node.name}`,
      });
    }

    return { breadcrumb, chain };
  }, [activePromptTopicId, topicHierarchy, normalizedObjective, recordSystemPrompt]);

  // Listen for prompt panel toggle events from topic headers
  useEffect(() => {
    const handleTogglePrompt = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.topicId) {
        setPromptPanelTopicId(prev => prev === detail.topicId ? null : detail.topicId);
      }
    };
    window.addEventListener("vllora_toggle_prompt_panel", handleTogglePrompt);
    return () => window.removeEventListener("vllora_toggle_prompt_panel", handleTogglePrompt);
  }, []);

  // Unified single-table rendering (when topic hierarchy is available)
  // Show topic structure even with 0 records so users can see their topics
  if (groupByTopic && topicHierarchy && topicHierarchy.length > 0) {
    return (
      <UnifiedTableView
        hierarchy={topicHierarchy}
        records={displayRecords}
        containerStyle={containerStyle}
        parentRef={parentRef}
        promptChainData={promptChainData}
        isAutoTracking={isAutoTracking}
        onClosePromptPanel={() => setPromptPanelTopicId(null)}
        onExpand={onExpand}
        hasMore={hasMore}
        onSeeAll={onSeeAll}
        showFooter={showFooter}
        selectedCount={selectedIds.size}
        workflowId={workflowId}
      />
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
            roleFilter={roleFilter}
            onRoleFilterChange={onRoleFilterChange}
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
                                ? "bg-[rgba(var(--theme-500),0.5)] border-[rgb(var(--theme-500))]"
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
                          ref={setRecordRef(record.id)}
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
                          isHighlighted={highlightedRecordId === record.id}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
        {hasMore && onSeeAll && <SeeAllLink onClick={onSeeAll} />}
        {showFooter && <RecordsTableFooter records={displayRecords} selectedCount={selectedIds.size} workflowId={workflowId} />}
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
            topicCounts={topicCounts}
            totalRecords={displayRecords.length}
            hasTopicHierarchy={hasTopicHierarchy}
            topicHierarchy={topicHierarchy}
            roleFilter={roleFilter}
            onRoleFilterChange={onRoleFilterChange}
          />
        )}
        <div className="flex-1 overflow-auto p-2 space-y-2">
          {displayRecords.map((record) => (
            <RecordRow
              key={record.id}
              ref={setRecordRef(record.id)}
              record={record}
              onUpdateTopic={onUpdateTopic}
              onDelete={onDelete}
              onSave={onSave}
              selectable={selectable}
              selected={selectedIds.has(record.id)}
              onSelect={(checked) => handleSelectRecord(record.id, checked)}
              onExpand={onExpand}
              availableTopics={availableTopics}
              isHighlighted={highlightedRecordId === record.id}
            />
          ))}
          {hasMore && onSeeAll && <SeeAllLink onClick={onSeeAll} />}
        </div>
        {showFooter && <RecordsTableFooter records={displayRecords} selectedCount={selectedIds.size} workflowId={workflowId} />}
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
          topicCounts={topicCounts}
          totalRecords={displayRecords.length}
          hasTopicHierarchy={hasTopicHierarchy}
          topicHierarchy={topicHierarchy}
          roleFilter={roleFilter}
          onRoleFilterChange={onRoleFilterChange}
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
                  ref={setRecordRef(record.id)}
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
                  isHighlighted={highlightedRecordId === record.id}
                />
              </div>
            );
          })}
        </div>
      </div>
      {isLoadingMore && (
        <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading more records...
        </div>
      )}
      {hasMore && onSeeAll && <SeeAllLink onClick={onSeeAll} />}
      {showFooter && (
        <RecordsTableFooter
          records={displayRecords}
          selectedCount={selectedIds.size}
          workflowId={workflowId}
          totalRecordsFromServer={totalRecordsFromServer}
        />
      )}
    </div>
  );
}

// ─── Unified Table View (used when topic hierarchy is available) ───

interface UnifiedTableViewProps {
  hierarchy: TopicHierarchyNode[];
  records: DatasetRecord[];
  containerStyle: React.CSSProperties;
  parentRef: React.RefObject<HTMLDivElement | null>;
  promptChainData: { breadcrumb: string[]; chain: { label: string; level: "root" | "parent" | "leaf"; prompt: string }[] } | null;
  isAutoTracking: boolean;
  onClosePromptPanel: () => void;
  onExpand?: (record: DatasetRecord) => void;
  hasMore: boolean;
  onSeeAll?: () => void;
  showFooter: boolean;
  selectedCount: number;
  workflowId?: string;
}

function UnifiedTableView({
  hierarchy,
  records,
  containerStyle,
  parentRef,
  promptChainData,
  isAutoTracking,
  onClosePromptPanel,
  onExpand,
  hasMore,
  onSeeAll,
  showFooter,
  selectedCount,
  workflowId,
}: UnifiedTableViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [scoreFilter, setScoreFilter] = useState("all");

  // Job score columns (eval + finetune)
  const finetuneCtx = FinetuneJobsConsumer();
  const { columns: jobColumns, getScoresForRecord } = useJobScoreColumns(finetuneCtx);

  // Knowledge sources for resolving source_parts refs in record rows
  const { sources } = KnowledgeSourcesConsumer();

  // Count filtered records for toolbar display
  const filteredCount = useMemo(() => {
    let count = 0;
    const queryLower = searchQuery.toLowerCase();
    for (const record of records) {
      // Topic filter
      if (topicFilter !== "all" && record.topic !== topicFilter) continue;
      // Search filter (simple check on stringified data)
      if (queryLower) {
        const dataStr = JSON.stringify(record.data ?? "").toLowerCase();
        if (!dataStr.includes(queryLower)) continue;
      }
      // Score filter
      const score = record.evaluation?.score ?? record.evaluation?.evalScore;
      if (scoreFilter === "high" && (score === undefined || score < 0.8)) continue;
      if (scoreFilter === "mid" && (score === undefined || score < 0.6 || score >= 0.8)) continue;
      if (scoreFilter === "low" && (score === undefined || score >= 0.6)) continue;
      if (scoreFilter === "perfect" && (score === undefined || score < 0.995)) continue;
      if (scoreFilter === "zero" && (score === undefined || score > 0.005)) continue;
      if (scoreFilter === "unscored" && score !== undefined) continue;
      count++;
    }
    return count;
  }, [records, searchQuery, topicFilter, scoreFilter]);

  return (
    <div className="flex flex-col min-h-0" style={containerStyle}>
      {/* Prompt inheritance panel — shown when a topic is focused */}
      {promptChainData && (
        <PromptInheritancePanel
          breadcrumb={promptChainData.breadcrumb}
          chain={promptChainData.chain}
          onClose={onClosePromptPanel}
          isAutoTracking={isAutoTracking}
        />
      )}

      {/* Toolbar */}
      <UnifiedTableToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        topicFilter={topicFilter}
        onTopicFilterChange={setTopicFilter}
        scoreFilter={scoreFilter}
        onScoreFilterChange={setScoreFilter}
        totalRecords={records.length}
        filteredRecords={filteredCount}
        hierarchy={hierarchy}
      />

      {/* Unified table */}
      <div ref={parentRef} className="flex-1 overflow-auto min-h-0 bg-background">
        <UnifiedRecordTable
          hierarchy={hierarchy}
          records={records}
          searchQuery={searchQuery}
          topicFilter={topicFilter}
          scoreFilter={scoreFilter}
          onExpand={onExpand}
          jobColumns={jobColumns}
          getScoresForRecord={getScoresForRecord}
          sources={sources}
        />
      </div>

      {hasMore && onSeeAll && <SeeAllLink onClick={onSeeAll} />}
      {showFooter && <RecordsTableFooter records={records} selectedCount={selectedCount} workflowId={workflowId} />}
    </div>
  );
}
