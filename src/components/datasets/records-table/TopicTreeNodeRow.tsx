/**
 * TopicTreeNodeRow
 *
 * Renders a single node in the topic record tree with breadcrumb path display.
 * Used by TopicRecordTree to display hierarchical topic groupings.
 */

import { useState, useEffect, useRef } from "react";
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
  /** Topic name currently being generated (for loading indicator) */
  generatingTopic?: string | null;
  /** Progress of data generation (completed/total) */
  generatingProgress?: { completed: number; total: number } | null;
}

/** Check if a target topic exists anywhere in a node's subtree */
function hasDescendant(node: TopicHierarchyNode, targetId: string, targetName: string): boolean {
  if (!node.children) return false;
  for (const child of node.children) {
    if (child.id === targetId || child.name === targetId || child.name === targetName) return true;
    if (hasDescendant(child, targetId, targetName)) return true;
  }
  return false;
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
  onDeleteTopic,
  onGenerateForTopic,
  onGenerateSubtopics,
  highlightedRecordId,
  setRecordRef,
  generatingTopic,
  generatingProgress,
}: TopicTreeNodeRowProps) {
  const [isExpanded, setIsExpanded] = useState(true); // Expand all by default
  const [isHighlightedTopic, setIsHighlightedTopic] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  // Listen for focus-topic events from canvas "View in Table" button
  useEffect(() => {
    const handleFocus = (e: Event) => {
      const { topicId, topicName } = (e as CustomEvent).detail ?? {};
      if (!topicId) return;

      const isTarget = topicId === node.id || topicId === node.name || topicName === node.name;
      const isAncestor = hasDescendant(node, topicId, topicName || "");
      // Check if this node is a direct child of the target (expand one child level)
      const parentName = parentPath.length > 0 ? parentPath[parentPath.length - 1] : null;
      const isDirectChildOfTarget = parentName != null &&
        (parentName === topicId || parentName === topicName);

      if (isTarget) {
        // This is the focused topic — expand, highlight header, scroll into view
        setIsExpanded(true);
        setIsHighlightedTopic(true);
        setTimeout(() => {
          headerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
        setTimeout(() => setIsHighlightedTopic(false), 2500);
      } else if (isAncestor || isDirectChildOfTarget) {
        // Target is a descendant, or this is a direct child of the target — expand
        setIsExpanded(true);
      } else {
        // Unrelated topic — collapse
        setIsExpanded(false);
      }
    };
    window.addEventListener("vllora_focus_topic", handleFocus);
    return () => window.removeEventListener("vllora_focus_topic", handleFocus);
  }, [node]);

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
      <div ref={headerRef}>
        <TopicNodeHeader
          path={currentPath}
          description={node.description}
          hasContent={hasContent}
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded(!isExpanded)}
          totalCount={totalCount}
          percentage={percentage}
          hasChildren={!!hasChildren}
          onDeleteTopic={onDeleteTopic}
          onGenerateForTopic={onGenerateForTopic}
          onGenerateSubtopics={onGenerateSubtopics}
          isGenerating={node.name === generatingTopic}
          generatingProgress={node.name === generatingTopic ? generatingProgress : undefined}
          highlighted={isHighlightedTopic}
        />
      </div>

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
                onDeleteTopic={onDeleteTopic}
                onGenerateForTopic={onGenerateForTopic}
                onGenerateSubtopics={onGenerateSubtopics}
                highlightedRecordId={highlightedRecordId}
                setRecordRef={setRecordRef}
                generatingTopic={generatingTopic}
                generatingProgress={generatingProgress}
              />
            ))}

          {/* Records at this node */}
          {hasRecords && (
            <div className="p-2 space-y-1">
              {directRecords.map((record) => (
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
      )}
    </div>
  );
}
