/**
 * DatasetMainContent
 *
 * Main content area for displaying dataset records.
 * Includes header with overview card, and switches between Canvas/Table views.
 * Note: Evaluator is now a separate section, not handled here.
 */

import type { ViewMode } from "./dataset-detail-header/DatasetUtilityBar";
import type { CoverageStats, DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import type { AvailableTopic } from "./record-utils";
import { RecordsSectionHeader } from "./dataset-detail-header/RecordsSectionHeader";
import { DatasetOverviewCard } from "./dataset-detail-header/overview-card";
import { TopicHierarchyCanvas } from "./dataset-canvas/TopicHierarchyCanvas";
import { RecordsTable } from "./records-table/RecordsTable";
import { RecordDetailSidebar } from "./records-table/RecordDetailSidebar";
import { EmptyRecordsState } from "./EmptyRecordsState";

type BalanceRating = "excellent" | "good" | "fair" | "poor" | "critical";

export interface DatasetMainContentProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onExport: () => void;
  datasetId: string;
  records: DatasetRecord[];
  topicHierarchy?: TopicHierarchyNode[];
  coverageStats?: CoverageStats;
  availableTopics: AvailableTopic[];

  // Overview card props
  overviewStats: {
    total: number;
    original: number;
    generated: number;
    topicDistribution: Record<string, number>;
    uncategorizedCount: number;
    balanceRating?: BalanceRating;
    balanceScore?: number;
  };
  leafTopicCount: number;
  onOverviewClick: () => void;
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
  overviewStats,
  leafTopicCount,
  onOverviewClick,
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
}: DatasetMainContentProps) {
  const hasTopics = topicHierarchy && topicHierarchy.length > 0;

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
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Records Section Header */}
      <div className="px-4 py-3 border-b border-border space-y-3">
        {/* Overview card */}
        <DatasetOverviewCard
          total={overviewStats.total}
          original={overviewStats.original}
          generated={overviewStats.generated}
          topicDistribution={overviewStats.topicDistribution}
          uncategorizedCount={overviewStats.uncategorizedCount}
          leafTopicCount={leafTopicCount}
          balanceRating={overviewStats.balanceRating}
          balanceScore={overviewStats.balanceScore}
          onClick={onOverviewClick}
          onImportClick={onImportClick}
        />
        {/* View controls below card */}
        <RecordsSectionHeader
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          onExport={onExport}
          records={records}
          datasetId={datasetId}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
      {viewMode === "canvas" ? (
        <TopicHierarchyCanvas
          hierarchy={topicHierarchy}
          records={records}
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
        />
      ) : (
        <>
          {/* Records Table */}
          <RecordsTable
            records={records}
            datasetId={datasetId}
            showHeader={true}
            showFooter={false}
            height="auto"
            groupByTopic={true}
            topicHierarchy={topicHierarchy}
            availableTopics={availableTopics}
            onUpdateTopic={onUpdateRecordTopic}
            onDelete={onDeleteRecord}
            onSave={onSaveRecord}
            onExpand={(record) => onSelectRecordId(record.id)}
            viewingRecordId={selectedRecordId}
            onDeleteTopic={onDeleteTopic}
            onGenerateForTopic={onGenerateForTopic}
            onGenerateSubtopics={onGenerateSubtopics}
          />

          {/* Record Detail Sidebar (Sheet - renders via portal) */}
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
          />
        </>
      )}
      </div>
    </div>
  );
}
