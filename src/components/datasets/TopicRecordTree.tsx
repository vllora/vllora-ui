/**
 * TopicRecordTree
 *
 * Displays records in a nested tree following the topic hierarchy structure.
 * Uses the existing TopicHierarchyNode[] from dataset.topicHierarchy.hierarchy.
 */

import { useState, useMemo } from "react";
import { ChevronDown, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { RecordRow } from "./RecordRow";
import { TopicTreeNodeRow } from "./TopicTreeNodeRow";
import type { AvailableTopic } from "./record-utils";

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
  /** Available topics for topic cell */
  availableTopics?: AvailableTopic[];
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
    const directCount = recordsByTopic.get(node.name)?.length || 0;
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
  availableTopics = [],
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
      {/* Render hierarchy tree */}
      {hierarchy.map((node) => (
        <TopicTreeNodeRow
          key={node.id}
          node={node}
          depth={0}
          parentPath={[]}
          recordsByTopic={recordsByTopic}
          descendantCounts={descendantCounts}
          onUpdateTopic={onUpdateTopic}
          onDelete={onDelete}
          onSave={onSave}
          selectable={selectable}
          selectedIds={selectedIds}
          onSelectRecord={onSelectRecord}
          onExpand={onExpand}
          availableTopics={availableTopics}
        />
      ))}

      {/* Unassigned records section */}
      {unassignedRecords.length > 0 && (
        <UnassignedSection
          records={unassignedRecords}
          onUpdateTopic={onUpdateTopic}
          onDelete={onDelete}
          onSave={onSave}
          selectable={selectable}
          selectedIds={selectedIds}
          onSelectRecord={onSelectRecord}
          onExpand={onExpand}
          availableTopics={availableTopics}
        />
      )}
    </div>
  );
}

interface UnassignedSectionProps {
  records: DatasetRecord[];
  onUpdateTopic: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  onDelete: (recordId: string) => void;
  onSave?: (recordId: string, data: unknown) => Promise<void>;
  selectable: boolean;
  selectedIds: Set<string>;
  onSelectRecord: (recordId: string, checked: boolean) => void;
  onExpand?: (record: DatasetRecord) => void;
  availableTopics: AvailableTopic[];
}

function UnassignedSection({
  records,
  onUpdateTopic,
  onDelete,
  onSave,
  selectable,
  selectedIds,
  onSelectRecord,
  onExpand,
  availableTopics,
}: UnassignedSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="border-t border-border/50">
      <button
        className="w-full flex items-center gap-3 py-3 px-4 text-left transition-colors hover:bg-muted/40"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="w-5 h-5 flex items-center justify-center shrink-0">
          <ChevronDown
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform duration-200",
              !isExpanded && "-rotate-90"
            )}
          />
        </span>
        <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Unassigned
        </span>
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-muted text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          <span>{records.length.toLocaleString()}</span>
          <span className="opacity-70">RECORDS</span>
        </span>
      </button>

      {isExpanded && (
        <div className="p-2 space-y-2 bg-muted/10">
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
              availableTopics={availableTopics}
              hideTopic
            />
          ))}
        </div>
      )}
    </div>
  );
}
