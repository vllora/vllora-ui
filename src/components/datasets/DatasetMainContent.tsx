/**
 * DatasetMainContent
 *
 * Main content area for displaying dataset records.
 * Includes header with overview card, and switches between Canvas/Table views.
 * Note: Evaluator is now a separate section, not handled here.
 */

import { useState, useMemo, useCallback } from "react";
import type { ViewMode } from "./dataset-detail-header/ViewModeToggle";
import type { CoverageStats, DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import type { AvailableTopic } from "./record-utils";
import { RecordsSectionHeader } from "./dataset-detail-header/RecordsSectionHeader";
import { TopicHierarchyCanvas } from "./dataset-canvas/TopicHierarchyCanvas";
import { RecordsTable } from "./records-table/RecordsTable";
import { RecordDetailSidebar } from "./records-table/RecordDetailSidebar";
import { EmptyRecordsState } from "./EmptyRecordsState";
import { filterRecords, type StatFilter, type RecordRole } from "./record-filters";

export interface DatasetMainContentProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onExport: () => void;
  datasetId: string;
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
}

export function DatasetMainContent({
  viewMode,
  onViewModeChange,
  onExport,
  datasetId,
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
  // P0-19: Stat filter state for RecordsSectionHeader clickable chips
  const [activeStatFilter, setActiveStatFilter] = useState<StatFilter>("all");
  // P0-9: Role filter state for RecordsTableHeader
  const [roleFilter, setRoleFilter] = useState<RecordRole>("all");
  // Search query state
  const [searchQuery, setSearchQuery] = useState("");

  // When a topic is selected from Explorer, filter records to that subtree
  const topicFilteredRecords = useMemo(() => {
    if (!topicFilter || !topicHierarchy) return records;

    // Find the node matching the topic path (e.g., "FEN Position Analysis")
    // and collect all descendant topic IDs so we show its entire subtree
    const pathSegments = topicFilter.split("/");
    let currentNodes: TopicHierarchyNode[] | undefined = topicHierarchy;
    let matchedNode: TopicHierarchyNode | undefined;

    for (const segment of pathSegments) {
      matchedNode = currentNodes?.find((n) => n.name === segment);
      if (!matchedNode) break;
      currentNodes = matchedNode.children;
    }

    if (!matchedNode) return records;

    // Collect all topic IDs under this node (including itself)
    const ids = new Set<string>();
    const collect = (node: TopicHierarchyNode) => {
      ids.add(node.id || node.name);
      ids.add(node.name);
      node.children?.forEach(collect);
    };
    collect(matchedNode);

    return records.filter((r) => r.topic && ids.has(r.topic));
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

    const pathSegments = topicFilter.split("/");
    let currentNodes: TopicHierarchyNode[] | undefined = topicHierarchy;
    let matchedNode: TopicHierarchyNode | undefined;

    for (const segment of pathSegments) {
      matchedNode = currentNodes?.find((n) => n.name === segment);
      if (!matchedNode) break;
      currentNodes = matchedNode.children;
    }

    // Return the matched node as a single-root hierarchy
    return matchedNode ? [matchedNode] : topicHierarchy;
  }, [topicFilter, topicHierarchy]);

  const hasTopics = displayHierarchy && displayHierarchy.length > 0;

  // Show empty state only when no records AND no topic hierarchy
  // If topics exist, show the table/canvas with empty topic groups
  if (records.length === 0 && !hasTopics) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <EmptyRecordsState
          datasetId={datasetId}
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
      {/* Stats bar + view controls */}
      <div className="px-4 py-2 border-b border-border shrink-0 bg-background">
        <RecordsSectionHeader
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          onExport={onExport}
          records={topicFilteredRecords}
          datasetId={datasetId}
          activeStatFilter={activeStatFilter}
          onStatFilterChange={setActiveStatFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sourceDocumentFilterName={sourceDocumentFilterName}
          onClearSourceDocumentFilter={onClearSourceDocumentFilter}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {viewMode === "canvas" ? (
        <TopicHierarchyCanvas
          hierarchy={displayHierarchy}
          records={filteredRecords}
          datasetId={datasetId}
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
      ) : (
        <RecordsTable
          records={filteredRecords}
          datasetId={datasetId}
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
