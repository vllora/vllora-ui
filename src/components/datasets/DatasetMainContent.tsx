/**
 * DatasetMainContent
 *
 * Main content area that switches between Canvas and Table views.
 * Displays topic hierarchy canvas or records table based on view mode.
 */

import type { ViewMode } from "./dataset-detail-header/DatasetUtilityBar";
import type { CoverageStats, DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import type { AvailableTopic } from "./record-utils";
import { TopicHierarchyCanvas } from "./dataset-canvas/TopicHierarchyCanvas";
import { RecordsTable } from "./records-table/RecordsTable";
import { RecordDetailSidebar } from "./records-table/RecordDetailSidebar";

export interface DatasetMainContentProps {
  viewMode: ViewMode;
  datasetId: string;
  records: DatasetRecord[];
  topicHierarchy?: TopicHierarchyNode[];
  coverageStats?: CoverageStats;
  availableTopics: AvailableTopic[];

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
}

export function DatasetMainContent({
  viewMode,
  datasetId,
  records,
  topicHierarchy,
  coverageStats,
  availableTopics,
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
}: DatasetMainContentProps) {
  return (
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
            showFooter={true}
            height="auto"
            groupByTopic={true}
            topicHierarchy={topicHierarchy}
            availableTopics={availableTopics}
            onUpdateTopic={onUpdateRecordTopic}
            onDelete={onDeleteRecord}
            onSave={onSaveRecord}
            onExpand={(record) => onSelectRecordId(record.id)}
            viewingRecordId={selectedRecordId}
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
  );
}
