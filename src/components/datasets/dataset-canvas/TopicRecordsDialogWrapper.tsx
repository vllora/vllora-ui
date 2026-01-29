/**
 * TopicRecordsDialogWrapper
 *
 * Wrapper component that consumes TopicCanvasContext and renders
 * the TopicRecordsDialog with the appropriate data.
 */

import { TopicCanvasConsumer } from "./TopicCanvasContext";
import { TopicRecordsDialog } from "./TopicRecordsDialog";

export function TopicRecordsDialogWrapper() {
  const {
    viewingTopicId,
    closeTopicModal,
    recordsByTopic,
    datasetId,
    availableTopics,
    onUpdateRecordTopic,
    onDeleteRecord,
    onSaveRecord,
    
  } = TopicCanvasConsumer();

  // Get records for the currently viewing topic
  const topicRecords = viewingTopicId ? (recordsByTopic[viewingTopicId] || []) : [];

  return (
    <TopicRecordsDialog
      open={viewingTopicId !== null}
      onOpenChange={(open) => {
        if (!open) closeTopicModal();
      }}
      topicName={viewingTopicId || ""}
      records={topicRecords}
      datasetId={datasetId}
      availableTopics={availableTopics}
      onUpdateRecordTopic={onUpdateRecordTopic}
      onDeleteRecord={onDeleteRecord}
      onSaveRecord={onSaveRecord}
    />
  );
}
