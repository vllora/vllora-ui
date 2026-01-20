/**
 * TopicRecordTree
 *
 * Displays records in a nested tree following the topic hierarchy structure.
 * Uses the existing TopicHierarchyNode[] from dataset.topicHierarchy.hierarchy.
 */

import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { RecordRow } from "./RecordRow";
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

interface TreeNodeProps {
  node: TopicHierarchyNode;
  depth: number;
  recordsByTopic: Map<string, DatasetRecord[]>;
  descendantCounts: Map<string, number>;
  onUpdateTopic: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  onDelete: (recordId: string) => void;
  onSave?: (recordId: string, data: unknown) => Promise<void>;
  selectable: boolean;
  selectedIds: Set<string>;
  onSelectRecord: (recordId: string, checked: boolean) => void;
  onExpand?: (record: DatasetRecord) => void;
  availableTopics: AvailableTopic[];
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

function TreeNode({
  node,
  depth,
  recordsByTopic,
  descendantCounts,
  onUpdateTopic,
  onDelete,
  onSave,
  selectable,
  selectedIds,
  onSelectRecord,
  onExpand,
  availableTopics,
}: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true); // Expand all by default

  const hasChildren = node.children && node.children.length > 0;
  const records = recordsByTopic.get(node.name) || [];
  const hasRecords = records.length > 0;
  const hasContent = hasChildren || hasRecords;
  const totalCount = descendantCounts.get(node.id) || 0;

  // Determine if this is a leaf node (no children)
  const isLeaf = !hasChildren;

  // Icon based on node type
  const Icon = isLeaf ? FileText : isExpanded ? FolderOpen : Folder;

  return (
    <div className="relative">
      {/* Vertical tree line from parent */}
      {depth > 0 && (
        <div
          className="absolute border-l border-border/40"
          style={{
            left: `${(depth - 1) * 24 + 20}px`,
            top: 0,
            height: "20px",
          }}
        />
      )}

      {/* Horizontal connector to node */}
      {depth > 0 && (
        <div
          className="absolute border-t border-border/40"
          style={{
            left: `${(depth - 1) * 24 + 20}px`,
            top: "20px",
            width: "12px",
          }}
        />
      )}

      {/* Node header */}
      <button
        className={cn(
          "w-full flex items-center gap-2 py-2.5 px-3 text-left transition-colors",
          "hover:bg-muted/30",
          hasContent ? "cursor-pointer" : "cursor-default opacity-60"
        )}
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
        onClick={() => hasContent && setIsExpanded(!isExpanded)}
        disabled={!hasContent}
      >
        {/* Expand/collapse indicator */}
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          {hasContent ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
          )}
        </span>

        {/* Folder/file icon */}
        <Icon
          className={cn(
            "w-4 h-4 shrink-0",
            isLeaf ? "text-muted-foreground" : "text-[rgb(var(--theme-500))]"
          )}
        />

        {/* Node name */}
        <span className="font-medium text-sm truncate">{node.name}</span>

        {/* Record count */}
        <span className="text-sm text-muted-foreground ml-1">
          {totalCount} record{totalCount !== 1 ? "s" : ""}
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && hasContent && (
        <div className="relative">
          {/* Vertical line connecting children/records */}
          {(hasChildren || hasRecords) && (
            <div
              className="absolute border-l border-border/40"
              style={{
                left: `${depth * 24 + 20}px`,
                top: 0,
                bottom: 0,
              }}
            />
          )}

          {/* Child nodes */}
          {hasChildren &&
            node.children!.map((child, idx) => (
              <div key={child.id} className="relative">
                {/* Hide the bottom part of the vertical line for the last child */}
                {idx === node.children!.length - 1 && !hasRecords && (
                  <div
                    className="absolute bg-card"
                    style={{
                      left: `${depth * 24 + 19}px`,
                      top: "20px",
                      bottom: 0,
                      width: "2px",
                    }}
                  />
                )}
                <TreeNode
                  node={child}
                  depth={depth + 1}
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
              </div>
            ))}

          {/* Records at this node (only shown for leaf nodes) */}
          {hasRecords && (
            <div
              className="divide-y divide-border/50"
              style={{ marginLeft: `${(depth + 1) * 24}px` }}
            >
              {records.map((record, idx) => (
                <div key={record.id} className="relative">
                  {/* Horizontal connector to record */}
                  <div
                    className="absolute border-t border-border/40"
                    style={{
                      left: `-4px`,
                      width: "16px",
                      top: "55px", // Center of row
                    }}
                  />
                  {/* Vertical connector between records */}
                  {idx < records.length - 1 && (
                    <div
                      className="absolute border-l border-border/40"
                      style={{
                        left: `-4px`,
                        top: "55px",
                        bottom: "-55px",
                      }}
                    />
                  )}
                  <RecordRow
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
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
    <div className="py-2">
      {/* Render hierarchy tree */}
      {hierarchy.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
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
    <div className="mt-4 pt-4 border-t border-border/50">
      <button
        className="w-full flex items-center gap-2 py-2.5 px-3 text-left transition-colors hover:bg-muted/30"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </span>
        <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="font-medium text-sm text-muted-foreground">Unassigned</span>
        <span className="text-sm text-muted-foreground ml-1">
          {records.length} record{records.length !== 1 ? "s" : ""}
        </span>
      </button>

      {isExpanded && (
        <div className="divide-y divide-border/50" style={{ marginLeft: "24px" }}>
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
