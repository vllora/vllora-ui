/**
 * TopicRecordTree
 *
 * Displays records in a nested tree following the topic hierarchy structure.
 * Uses the existing TopicHierarchyNode[] from dataset.topicHierarchy.hierarchy.
 */

import { useState, useMemo } from "react";
import { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { RecordRow } from "./RecordRow";
import { TopicTreeNodeRow } from "./TopicTreeNodeRow";
import { TopicNodeHeader } from "./TopicNodeHeader";
import type { AvailableTopic } from "../record-utils";

interface TopicRecordTreeProps {
  /** The topic hierarchy from dataset */
  hierarchy: TopicHierarchyNode[];
  /** All records to display */
  records: DatasetRecord[];
  /** Handler for updating record topic */
  onUpdateTopic: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  /** Handler for deleting a record */
  onDelete: (recordId: string) => void;
  /** Handler for saving record data changes */
  onSave?: (recordId: string, data: unknown) => Promise<void>;
  /** Enable selection mode */
  selectable?: boolean;
  /** Selected record IDs */
  selectedIds: Set<string>;
  /** Selection change handler */
  onSelectRecord: (recordId: string, checked: boolean) => void;
  /** Callback when expand is clicked */
  onExpand?: (record: DatasetRecord) => void;
  /** ID of record currently being viewed in sidebar */
  viewingRecordId?: string | null;
  /** Available topics for topic cell */
  availableTopics?: AvailableTopic[];
  /** Handler for deleting a topic */
  onDeleteTopic?: (topicName: string) => void;
  /** Handler for generating records for a topic */
  onGenerateForTopic?: (topicPath: string) => void;
  /** Handler for generating subtopics (null = root level) */
  onGenerateSubtopics?: (topicPath: string | null) => void;
}

/**
 * Calculate total record count for a node and all its descendants
 */
function calculateDescendantCounts(
  nodes: TopicHierarchyNode[],
  recordsByTopic: Map<string, DatasetRecord[]>,
  counts: Map<string, number>
): number {
  let total = 0;
  for (const node of nodes) {
    // Records can be stored by either node.id or node.name, try both
    const directCount = (recordsByTopic.get(node.id)?.length || 0) +
                        (node.id !== node.name ? (recordsByTopic.get(node.name)?.length || 0) : 0);
    const childCount = node.children
      ? calculateDescendantCounts(node.children, recordsByTopic, counts)
      : 0;
    const nodeTotal = directCount + childCount;
    counts.set(node.id, nodeTotal);
    total += nodeTotal;
  }
  return total;
}

export function TopicRecordTree({
  hierarchy,
  records,
  onUpdateTopic,
  onDelete,
  onSave,
  selectable = false,
  selectedIds,
  onSelectRecord,
  onExpand,
  viewingRecordId,
  availableTopics = [],
  onDeleteTopic,
  onGenerateForTopic,
  onGenerateSubtopics,
}: TopicRecordTreeProps) {
  // Group records by topic
  const recordsByTopic = useMemo(() => {
    const map = new Map<string, DatasetRecord[]>();
    for (const record of records) {
      const topic = record.topic || "__unassigned__";
      const existing = map.get(topic) || [];
      existing.push(record);
      map.set(topic, existing);
    }
    return map;
  }, [records]);

  // Calculate descendant counts for each node
  const descendantCounts = useMemo(() => {
    const counts = new Map<string, number>();
    calculateDescendantCounts(hierarchy, recordsByTopic, counts);
    return counts;
  }, [hierarchy, recordsByTopic]);

  // Get unassigned records
  const unassignedRecords = recordsByTopic.get("__unassigned__") || [];

  return (
    <div>
      {/* Unassigned records section - show first for visibility */}
      {unassignedRecords.length > 0 && (
        <UnassignedSection
          records={unassignedRecords}
          totalRecords={records.length}
          onUpdateTopic={onUpdateTopic}
          onDelete={onDelete}
          onSave={onSave}
          selectable={selectable}
          selectedIds={selectedIds}
          onSelectRecord={onSelectRecord}
          onExpand={onExpand}
          viewingRecordId={viewingRecordId}
          availableTopics={availableTopics}
        />
      )}

      {/* Render hierarchy tree */}
      {hierarchy.map((node) => (
        <TopicTreeNodeRow
          key={node.id}
          node={node}
          depth={0}
          parentPath={[]}
          recordsByTopic={recordsByTopic}
          descendantCounts={descendantCounts}
          totalRecords={records.length}
          onUpdateTopic={onUpdateTopic}
          onDelete={onDelete}
          onSave={onSave}
          selectable={selectable}
          selectedIds={selectedIds}
          onSelectRecord={onSelectRecord}
          onExpand={onExpand}
          viewingRecordId={viewingRecordId}
          availableTopics={availableTopics}
          onDeleteTopic={onDeleteTopic}
          onGenerateForTopic={onGenerateForTopic}
          onGenerateSubtopics={onGenerateSubtopics}
        />
      ))}
    </div>
  );
}

interface UnassignedSectionProps {
  records: DatasetRecord[];
  totalRecords: number;
  onUpdateTopic: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  onDelete: (recordId: string) => void;
  onSave?: (recordId: string, data: unknown) => Promise<void>;
  selectable: boolean;
  selectedIds: Set<string>;
  onSelectRecord: (recordId: string, checked: boolean) => void;
  onExpand?: (record: DatasetRecord) => void;
  viewingRecordId?: string | null;
  availableTopics: AvailableTopic[];
}

function UnassignedSection({
  records,
  totalRecords,
  onUpdateTopic,
  onDelete,
  onSave,
  selectable,
  selectedIds,
  onSelectRecord,
  onExpand,
  viewingRecordId,
  availableTopics,
}: UnassignedSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const percentage = totalRecords > 0 ? (records.length / totalRecords) * 100 : 0;

  return (
    <div>
      <TopicNodeHeader
        path={[]}
        hasContent={true}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
        totalCount={records.length}
        percentage={percentage}
        hasChildren={false}
        variant="unassigned"
      />

      {isExpanded && (
        <div className="p-2 space-y-1 bg-transparent">
          {records.map((record) => (
            <RecordRow
              key={record.id}
              record={record}
              onUpdateTopic={onUpdateTopic}
              onDelete={onDelete}
              onSave={onSave}
              selectable={selectable}
              selected={selectedIds.has(record.id)}
              onSelect={(checked) => onSelectRecord(record.id, checked)}
              onExpand={onExpand}
              isViewing={viewingRecordId === record.id}
              availableTopics={availableTopics}
              hideTopic
            />
          ))}
        </div>
      )}
    </div>
  );
}
