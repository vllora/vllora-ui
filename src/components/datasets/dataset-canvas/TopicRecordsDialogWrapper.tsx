/**
 * TopicRecordsDialogWrapper
 *
 * Wrapper component that consumes TopicCanvasContext and renders
 * the TopicRecordsDialog with the appropriate data.
 *
 * For parent topics, aggregates records from all descendant leaf topics.
 */

import { useMemo } from "react";
import { TopicCanvasConsumer } from "./TopicCanvasContext";
import { TopicRecordsDialog } from "./TopicRecordsDialog";
import { findTopicInHierarchy, getDescendantLeafTopicIds } from "../record-utils";
import type { TopicHierarchyNode } from "@/types/dataset-types";

export function TopicRecordsDialogWrapper() {
  const {
    viewingTopicId,
    closeTopicModal,
    recordsByTopic,
    hierarchy,
    datasetId,
    availableTopics,
    onUpdateRecordTopic,
    onDeleteRecord,
    onSaveRecord,

  } = TopicCanvasConsumer();

  // Get records and determine if this is a parent topic
  // For parent topics, aggregate records from all descendant leaf topics
  const { topicRecords, isParentTopic, subtreeHierarchy } = useMemo(() => {
    if (!viewingTopicId) {
      return { topicRecords: [], isParentTopic: false, subtreeHierarchy: undefined };
    }

    // Special case: __unassigned__ is always a direct lookup (not a parent)
    if (viewingTopicId === "__unassigned__") {
      return {
        topicRecords: recordsByTopic[viewingTopicId] || [],
        isParentTopic: false,
        subtreeHierarchy: undefined,
      };
    }

    // Check if this topic is a parent node in the hierarchy
    const topicNode = findTopicInHierarchy(hierarchy, viewingTopicId);

    if (topicNode && topicNode.children && topicNode.children.length > 0) {
      // Parent node - aggregate records from all descendant leaf topics
      const leafTopicIds = getDescendantLeafTopicIds(topicNode);
      const aggregatedRecords = [];
      for (const leafId of leafTopicIds) {
        const records = recordsByTopic[leafId];
        if (records) {
          aggregatedRecords.push(...records);
        }
      }
      return {
        topicRecords: aggregatedRecords,
        isParentTopic: true,
        subtreeHierarchy: topicNode.children as TopicHierarchyNode[],
      };
    }

    // Leaf node or not found in hierarchy - use direct lookup
    return {
      topicRecords: recordsByTopic[viewingTopicId] || [],
      isParentTopic: false,
      subtreeHierarchy: undefined,
    };
  }, [viewingTopicId, recordsByTopic, hierarchy]);

  return (
    <TopicRecordsDialog
      open={viewingTopicId !== null}
      onOpenChange={(open) => {
        if (!open) closeTopicModal();
      }}
      topicName={viewingTopicId || ""}
      records={topicRecords}
      isParentTopic={isParentTopic}
      subtreeHierarchy={subtreeHierarchy}
      datasetId={datasetId}
      availableTopics={availableTopics}
      onUpdateRecordTopic={onUpdateRecordTopic}
      onDeleteRecord={onDeleteRecord}
      onSaveRecord={onSaveRecord}
    />
  );
}
