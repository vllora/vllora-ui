/**
 * TopicRecordTree
 *
 * Displays records in a nested tree following the topic hierarchy structure.
 * Uses the existing TopicHierarchyNode[] from dataset.topicHierarchy.hierarchy.
 */

import { useState, useMemo, useEffect } from "react";
import { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { RecordRow } from "./RecordRow";
import { TopicTreeNodeRow } from "./TopicTreeNodeRow";
import { TopicNodeHeader } from "./TopicNodeHeader";
import type { AvailableTopic } from "../record-utils";
import { emitter } from "@/utils/eventEmitter";

interface TopicRecordTreeProps {
  /** The topic hierarchy from dataset */
  hierarchy: TopicHierarchyNode[];
  /** All records to display */
  records: DatasetRecord[];
  /** Dataset ID for listening to generation events */
  workflowId: string;
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
  /** ID of record to highlight (for variant source navigation) */
  highlightedRecordId?: string | null;
  /** Callback to set record ref for scrolling */
  setRecordRef?: (recordId: string) => (el: HTMLDivElement | null) => void;
  /** Dataset training objective (for computing shared system prompts per topic) */
  datasetObjective?: string;
  /** LLM-normalized "You are ..." role sentence (cached on dataset) */
  normalizedObjective?: string;
  /** Handler for updating a topic's custom prompt template */
  onUpdatePromptTemplate?: (topicId: string, template: string | undefined) => void;
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
  workflowId,
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
  highlightedRecordId,
  setRecordRef,
  datasetObjective,
  normalizedObjective,
  onUpdatePromptTemplate,
}: TopicRecordTreeProps) {
  // Track which topic is currently being generated and progress
  const [generatingTopic, setGeneratingTopic] = useState<string | null>(null);
  const [generatingProgress, setGeneratingProgress] = useState<{ completed: number; total: number } | null>(null);

  // Listen for data generation progress events
  useEffect(() => {
    const handleProgress = (event: {
      workflowId: string;
      status: string;
      completed?: number;
      total?: number;
      currentTopic?: string;
      topicCompleted?: number;
      topicTotal?: number;
    }) => {
      if (event.workflowId !== workflowId) return;

      if (event.status === 'started' || event.status === 'progress') {
        // Set current topic if available
        if (event.currentTopic) {
          setGeneratingTopic(event.currentTopic);
        }
        // Prefer topic-specific progress, fall back to overall progress
        if (event.topicCompleted !== undefined && event.topicTotal !== undefined) {
          setGeneratingProgress({ completed: event.topicCompleted, total: event.topicTotal });
        } else if (event.completed !== undefined && event.total !== undefined) {
          setGeneratingProgress({ completed: event.completed, total: event.total });
        }
      } else if (event.status === 'completed' || event.status === 'failed') {
        setGeneratingTopic(null);
        setGeneratingProgress(null);
      }
    };

    emitter.on('vllora_data_generation_progress', handleProgress);
    return () => {
      emitter.off('vllora_data_generation_progress', handleProgress);
    };
  }, [workflowId]);

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
          highlightedRecordId={highlightedRecordId}
          setRecordRef={setRecordRef}
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
          highlightedRecordId={highlightedRecordId}
          setRecordRef={setRecordRef}
          generatingTopic={generatingTopic}
          generatingProgress={generatingProgress}
          datasetObjective={datasetObjective}
          normalizedObjective={normalizedObjective}
          onUpdatePromptTemplate={onUpdatePromptTemplate}
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
  highlightedRecordId?: string | null;
  setRecordRef?: (recordId: string) => (el: HTMLDivElement | null) => void;
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
  highlightedRecordId,
  setRecordRef,
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
              ref={setRecordRef?.(record.id)}
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
              isHighlighted={highlightedRecordId === record.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
