/**
 * TopicTreeNodeRow
 *
 * Renders a single node in the topic record tree with breadcrumb path display.
 * Used by TopicRecordTree to display hierarchical topic groupings.
 */

import { useState } from "react";
import { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { RecordRow } from "./RecordRow";
import { TopicNodeHeader } from "./TopicNodeHeader";
import type { AvailableTopic } from "../record-utils";

// Re-export for convenience
export { TopicNodeHeader } from "./TopicNodeHeader";
export type { TopicNodeHeaderProps } from "./TopicNodeHeader";

export interface TopicTreeNodeRowProps {
  node: TopicHierarchyNode;
  depth: number;
  parentPath: string[];
  recordsByTopic: Map<string, DatasetRecord[]>;
  descendantCounts: Map<string, number>;
  /** Total records count for percentage calculation */
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

export function TopicTreeNodeRow({
  node,
  depth,
  parentPath,
  recordsByTopic,
  descendantCounts,
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
}: TopicTreeNodeRowProps) {
  const [isExpanded, setIsExpanded] = useState(true); // Expand all by default

  const hasChildren = node.children && node.children.length > 0;
  // Records can be keyed by either node.id or node.name, try both
  const recordsById = recordsByTopic.get(node.id) || [];
  const recordsByName = node.id !== node.name ? (recordsByTopic.get(node.name) || []) : [];
  const directRecords = [...recordsById, ...recordsByName];
  const hasRecords = directRecords.length > 0;
  const hasContent = hasChildren || hasRecords;
  const totalCount = descendantCounts.get(node.id) || 0;
  const percentage = totalRecords > 0 ? (totalCount / totalRecords) * 100 : 0;

  // Build the full path including this node
  const currentPath = [...parentPath, node.name];

  return (
    <div className="relative">
      <TopicNodeHeader
        path={currentPath}
        hasContent={hasContent}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
        totalCount={totalCount}
        percentage={percentage}
        hasChildren={!!hasChildren}
      />

      {/* Expanded content */}
      {isExpanded && hasContent && (
        <div className="bg-transparent">
          {/* Child nodes */}
          {hasChildren &&
            node.children!.map((child) => (
              <TopicTreeNodeRow
                key={child.id}
                node={child}
                depth={depth + 1}
                parentPath={currentPath}
                recordsByTopic={recordsByTopic}
                descendantCounts={descendantCounts}
                totalRecords={totalRecords}
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
            ))}

          {/* Records at this node */}
          {hasRecords && (
            <div className="p-2 space-y-1">
              {directRecords.map((record) => (
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
      )}
    </div>
  );
}
