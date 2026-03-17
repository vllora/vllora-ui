/**
 * DatasetMainContent
 *
 * Main content area for displaying dataset records.
 * Includes DataFlowBanner, header with stats, and switches between Canvas/Sources/Table views.
 * Note: Evaluator is now a separate section, not handled here.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import type { ViewMode } from "./dataset-detail-header/ViewModeToggle";
import type { CoverageStats, DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import type { AvailableTopic } from "./record-utils";
import { RecordsSectionHeader } from "./dataset-detail-header/RecordsSectionHeader";
import { TopicHierarchyCanvas } from "./dataset-canvas/TopicHierarchyCanvas";
import { RecordsTable } from "./records-table/RecordsTable";
import { RecordDetailSidebar } from "./records-table/RecordDetailSidebar";
import { SourcesView } from "./sources-view/SourcesView";
import { EmptyRecordsState } from "./EmptyRecordsState";
import { TopicDetailView } from "./TopicDetailView";
import { filterRecords, type StatFilter, type RecordRole } from "./record-filters";

/** Recursively find a topic node by name anywhere in the hierarchy, returning it and its parent path */
function findTopicByName(
  nodes: TopicHierarchyNode[],
  name: string,
  path: string[] = [],
  nodePath: TopicHierarchyNode[] = [],
): { node: TopicHierarchyNode; breadcrumb: string[]; nodePath: TopicHierarchyNode[] } | null {
  for (const node of nodes) {
    if (node.name === name) return { node, breadcrumb: path, nodePath };
    if (node.children) {
      const found = findTopicByName(node.children, name, [...path, node.name], [...nodePath, node]);
      if (found) return found;
    }
  }
  return null;
}

export interface DatasetMainContentProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onExport: () => void;
  workflowId: string;
  records: DatasetRecord[];
  topicHierarchy?: TopicHierarchyNode[];
  coverageStats?: CoverageStats;
  availableTopics: AvailableTopic[];

  /** Filter records to a specific topic and its descendants (from Explorer path) */
  topicFilter?: string;

  // Import + docs handlers (for empty state)
  onImportClick: () => void;
  onDocsClick?: () => void;

  // Canvas state
  selectedTopic: string | null;
  onSelectTopic: (topic: string | null) => void;

  // Table state
  selectedRecord: DatasetRecord | null;
  selectedRecordId: string | null;
  onSelectRecordId: (id: string | null) => void;

  // Handlers
  onAddTopic: (parentTopicName: string | null) => void;
  onRenameTopic: (oldName: string, newName: string) => void;
  onDeleteTopic: (topicId: string) => void;
  onUpdateRecordTopic: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  onDeleteRecord: (recordId: string) => void;
  onSaveRecord: (recordId: string, data: unknown) => Promise<void>;
  onCreateChildTopic: (parentTopicName: string | null, childTopicName: string) => Promise<void>;
  onGenerateForTopic: (topicName: string) => void;
  onGenerateSubtopics: (topicId: string | null) => void;

  // Empty state
  datasetObjective?: string;
  normalizedObjective?: string;

  // Docs processing state
  docsProcessing?: boolean;
  docsProcessingCount?: number;
  docsTotal?: number;

  // Source document filter (from context)
  sourceDocumentFilterName?: string | null;
  onClearSourceDocumentFilter?: () => void;

  /** Handler for updating a topic's custom prompt template */
  onUpdatePromptTemplate?: (topicId: string, template: string | undefined) => void;

  /** Per-topic quality scores for canvas node display */
  topicQualityScores?: Record<string, { avg: number; count: number; evaluated: number }>;

  // Data flow banner counts
  /** Number of knowledge source documents */
  documentCount?: number;
  /** Number of extracted parts across all sources */
  partCount?: number;
}

export function DatasetMainContent({
  viewMode,
  onViewModeChange,
  onExport,
  workflowId,
  records,
  topicHierarchy,
  coverageStats,
  availableTopics,
  topicFilter,
  onImportClick,
  onDocsClick,
  selectedTopic,
  onSelectTopic,
  selectedRecord,
  selectedRecordId,
  onSelectRecordId,
  onAddTopic,
  onRenameTopic,
  onDeleteTopic,
  onUpdateRecordTopic,
  onDeleteRecord,
  onSaveRecord,
  onCreateChildTopic,
  onGenerateForTopic,
  onGenerateSubtopics,
  datasetObjective,
  normalizedObjective,
  docsProcessing,
  docsProcessingCount,
  docsTotal,
  sourceDocumentFilterName,
  onClearSourceDocumentFilter,
  onUpdatePromptTemplate,
  topicQualityScores,
}: DatasetMainContentProps) {
  // Keyboard shortcuts: 1/2/3 switch views, Esc closes record detail
  useKeyboardShortcuts({
    onViewModeChange,
    onEscape: () => onSelectRecordId(null),
  });

  // Selected source ID for sources view (driven by explorer sidebar)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  // Listen for view switch events from explorer sidebar (e.g., "All Sources" click)
  useEffect(() => {
    const handleSwitchView = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.viewMode) {
        // If ifCurrently is set, only switch if current view matches
        if (detail.ifCurrently && viewMode !== detail.ifCurrently) return;

        onViewModeChange(detail.viewMode);
        // If switching to sources with a specific sourceId, set it
        if (detail.sourceId !== undefined) {
          setSelectedSourceId(detail.sourceId);
        } else if (detail.viewMode === "sources") {
          setSelectedSourceId(null); // All Sources
        }
      }
    };
    window.addEventListener("vllora_switch_view", handleSwitchView);
    return () => window.removeEventListener("vllora_switch_view", handleSwitchView);
  }, [onViewModeChange, viewMode]);

  // P0-19: Stat filter state for RecordsSectionHeader clickable chips
  const [activeStatFilter, setActiveStatFilter] = useState<StatFilter>("all");
  // P0-9: Role filter state for RecordsTableHeader
  const [roleFilter, setRoleFilter] = useState<RecordRole>("all");
  // Search query state
  const [searchQuery, setSearchQuery] = useState("");

  // When a topic is selected from Explorer, filter records to that subtree
  const topicFilteredRecords = useMemo(() => {
    if (!topicFilter || !topicHierarchy) return records;

    const match = findTopicByName(topicHierarchy, topicFilter);
    if (!match) return records;

    // Collect all topic names and IDs under this node (including itself)
    const names = new Set<string>();
    const collect = (node: TopicHierarchyNode) => {
      if (node.id) names.add(node.id);
      names.add(node.name);
      node.children?.forEach(collect);
    };
    collect(match.node);

    return records.filter((r) => {
      if (!r.topic) return false;
      if (names.has(r.topic)) return true;
      const leaf = r.topic.includes("/") ? r.topic.split("/").pop() : undefined;
      if (leaf && names.has(leaf)) return true;
      const metaPath = r.metadata?.topic_path;
      if (typeof metaPath === "string") {
        const metaLeaf = metaPath.split(" > ").pop()?.trim();
        if (metaLeaf && names.has(metaLeaf)) return true;
      }
      return false;
    });
  }, [records, topicFilter, topicHierarchy]);

  // Apply stat filter, role filter, and search to records
  const filteredRecords = useMemo(() => {
    const hasStatFilter = activeStatFilter !== "all";
    const hasRoleFilter = roleFilter !== "all";
    const hasSearch = searchQuery.trim().length > 0;
    if (!hasStatFilter && !hasRoleFilter && !hasSearch) return topicFilteredRecords;
    return filterRecords(topicFilteredRecords, {
      statFilter: hasStatFilter ? activeStatFilter : undefined,
      role: hasRoleFilter ? roleFilter : undefined,
      search: hasSearch ? searchQuery : undefined,
    });
  }, [topicFilteredRecords, activeStatFilter, roleFilter, searchQuery]);

  // Handle "View in Table" from canvas panel — switch to table view and focus the topic
  const handleViewInTable = useCallback((topicId: string) => {
    onViewModeChange("table");
    // Dispatch focus event after a short delay to let the table mount
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("vllora_focus_topic", {
        detail: { topicId, topicName: topicId },
      }));
    }, 100);
  }, [onViewModeChange]);

  // When filtering by topic, narrow the hierarchy to just the matched subtree
  const displayHierarchy = useMemo(() => {
    if (!topicFilter || !topicHierarchy) return topicHierarchy;

    const match = findTopicByName(topicHierarchy, topicFilter);
    return match ? [match.node] : topicHierarchy;
  }, [topicFilter, topicHierarchy]);

  // Resolve matched topic node + breadcrumb for TopicDetailView
  const topicDetail = useMemo(() => {
    if (!topicFilter || !topicHierarchy) return null;
    return findTopicByName(topicHierarchy, topicFilter);
  }, [topicFilter, topicHierarchy]);

  const hasTopics = displayHierarchy && displayHierarchy.length > 0;

  // Show empty state only when no records AND no topic hierarchy
  // If topics exist, show the table/canvas with empty topic groups
  if (records.length === 0 && !hasTopics) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <EmptyRecordsState
          workflowId={workflowId}
          datasetObjective={datasetObjective}
          hasTopicHierarchy={false}
          onImportClick={onImportClick}
          onDocsClick={onDocsClick}
          docsProcessing={docsProcessing}
          docsProcessingCount={docsProcessingCount}
          docsTotal={docsTotal}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Stats bar + view controls — Canvas and Table only (Sources has its own layout) */}
      {viewMode !== "sources" && (
        <div className="px-4 py-2 border-b border-border shrink-0 bg-background">
          <RecordsSectionHeader
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            onExport={onExport}
            records={topicFilteredRecords}
            workflowId={workflowId}
            activeStatFilter={activeStatFilter}
            onStatFilterChange={setActiveStatFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sourceDocumentFilterName={sourceDocumentFilterName}
            onClearSourceDocumentFilter={onClearSourceDocumentFilter}
            hideViewToggle={!!topicDetail}
          />
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {viewMode === "canvas" && (
        <TopicHierarchyCanvas
          hierarchy={displayHierarchy}
          records={filteredRecords}
          workflowId={workflowId}
          coverageStats={coverageStats}
          onSelectTopic={onSelectTopic}
          selectedTopic={selectedTopic}
          onAddTopic={onAddTopic}
          onRenameTopic={onRenameTopic}
          onDeleteTopic={onDeleteTopic}
          onUpdateRecordTopic={onUpdateRecordTopic}
          onDeleteRecord={onDeleteRecord}
          onSaveRecord={onSaveRecord}
          onCreateChildTopic={onCreateChildTopic}
          onGenerateForTopic={onGenerateForTopic}
          onGenerateSubtopics={onGenerateSubtopics}
          onSelectRecordId={onSelectRecordId}
          onViewInTable={handleViewInTable}
          datasetObjective={datasetObjective}
          normalizedObjective={normalizedObjective}
          topicQualityScores={topicQualityScores}
        />
      )}
      {viewMode === "sources" && (
        <SourcesView
          selectedSourceId={selectedSourceId}
          onSelectSource={(sourceId) => {
            setSelectedSourceId(sourceId);
            // Also notify explorer sidebar to highlight the source
            window.dispatchEvent(new CustomEvent("vllora_switch_view", {
              detail: { viewMode: "sources", sourceId },
            }));
          }}
        />
      )}
      {viewMode === "table" && topicDetail && (
        <TopicDetailView
          topicNode={topicDetail.node}
          ancestorNodes={topicDetail.nodePath}
          records={filteredRecords}
          onSelectRecord={onSelectRecordId}
          normalizedObjective={normalizedObjective}
        />
      )}
      {viewMode === "table" && !topicDetail && (
        <RecordsTable
          records={filteredRecords}
          workflowId={workflowId}
          showHeader={true}
          showFooter={false}
          height="auto"
          groupByTopic={true}
          topicHierarchy={displayHierarchy}
          availableTopics={availableTopics}
          onUpdateTopic={onUpdateRecordTopic}
          onDelete={onDeleteRecord}
          onSave={onSaveRecord}
          onExpand={(record) => onSelectRecordId(record.id)}
          viewingRecordId={selectedRecordId}
          onDeleteTopic={onDeleteTopic}
          onGenerateForTopic={onGenerateForTopic}
          onGenerateSubtopics={onGenerateSubtopics}
          roleFilter={roleFilter}
          onRoleFilterChange={setRoleFilter}
          datasetObjective={datasetObjective}
          normalizedObjective={normalizedObjective}
          onUpdatePromptTemplate={onUpdatePromptTemplate}
        />
      )}
      </div>

      {/* Record Detail Sidebar — shared across both table and canvas views (renders via portal) */}
      <RecordDetailSidebar
        record={selectedRecord}
        onClose={() => onSelectRecordId(null)}
        availableTopics={availableTopics}
        onUpdateTopic={onUpdateRecordTopic}
        onDelete={(recordId) => {
          onDeleteRecord(recordId);
          onSelectRecordId(null);
        }}
        onSave={onSaveRecord}
        records={filteredRecords}
        onNavigate={onSelectRecordId}
      />
    </div>
  );
}
