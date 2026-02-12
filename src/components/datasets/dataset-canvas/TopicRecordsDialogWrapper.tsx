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
    isFullDialogMode,
    recordsByTopic,
    hierarchy,
    datasetId,
    availableTopics,
    onUpdateRecordTopic,
    onDeleteRecord,
    onSaveRecord,
  } = TopicCanvasConsumer();

  // Only render dialog when in full dialog mode
  if (!isFullDialogMode) {
    return null;
  }

  // Get records and determine if this is a parent topic
  // For parent topics, aggregate records from all descendant leaf topics
  const { topicRecords, topicDisplayName, isParentTopic, subtreeHierarchy } = useMemo(() => {
    if (!viewingTopicId) {
      return { topicRecords: [], topicDisplayName: "", isParentTopic: false, subtreeHierarchy: undefined };
    }

    // Special case: __unassigned__ is always a direct lookup (not a parent)
    if (viewingTopicId === "__unassigned__") {
      return {
        topicRecords: recordsByTopic[viewingTopicId] || [],
        topicDisplayName: "Unassigned",
        isParentTopic: false,
        subtreeHierarchy: undefined,
      };
    }

    // Find the topic node in the hierarchy to get its display name
    const topicNode = findTopicInHierarchy(hierarchy, viewingTopicId);
    const displayName = topicNode?.name || viewingTopicId;

    if (topicNode && topicNode.children && topicNode.children.length > 0) {
      // Parent node - aggregate records from all descendant leaf topics
      const leafTopicIds = getDescendantLeafTopicIds(topicNode);
      const aggregatedRecords = [];
      for (const leafId of leafTopicIds) {
        // Try both id and name for each leaf (records may store topic as either)
        const records = recordsByTopic[leafId];
        if (records) {
          aggregatedRecords.push(...records);
        }
      }
      // Also try matching leaf names if ids didn't match
      if (aggregatedRecords.length === 0) {
        const leafNames = getDescendantLeafNames(topicNode);
        for (const leafName of leafNames) {
          const records = recordsByTopic[leafName];
          if (records) {
            aggregatedRecords.push(...records);
          }
        }
      }
      return {
        topicRecords: aggregatedRecords,
        topicDisplayName: displayName,
        isParentTopic: true,
        subtreeHierarchy: topicNode.children as TopicHierarchyNode[],
      };
    }

    // Leaf node - try both id and name for record lookup
    const byKey = recordsByTopic[viewingTopicId] || [];
    if (byKey.length > 0) {
      return {
        topicRecords: byKey,
        topicDisplayName: displayName,
        isParentTopic: false,
        subtreeHierarchy: undefined,
      };
    }
    // Fallback: try looking up by the node's name if different from viewingTopicId
    if (topicNode && topicNode.name !== viewingTopicId) {
      return {
        topicRecords: recordsByTopic[topicNode.name] || [],
        topicDisplayName: displayName,
        isParentTopic: false,
        subtreeHierarchy: undefined,
      };
    }
    // Fallback: try looking up by the node's id if different from viewingTopicId
    if (topicNode && topicNode.id !== viewingTopicId) {
      return {
        topicRecords: recordsByTopic[topicNode.id] || [],
        topicDisplayName: displayName,
        isParentTopic: false,
        subtreeHierarchy: undefined,
      };
    }

    return {
      topicRecords: [],
      topicDisplayName: displayName,
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
      topicName={topicDisplayName}
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

/** Get all descendant leaf node names (not ids) */
function getDescendantLeafNames(node: TopicHierarchyNode): string[] {
  if (!node.children || node.children.length === 0) {
    return [node.name];
  }
  const names: string[] = [];
  for (const child of node.children) {
    names.push(...getDescendantLeafNames(child));
  }
  return names;
}
