/**
 * TopicTreeNodeRow
 *
 * Renders a single node in the topic record tree with breadcrumb path display.
 * Used by TopicRecordTree to display hierarchical topic groupings.
 */

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { RecordRow } from "./RecordRow";
import type { AvailableTopic } from "../record-utils";

export interface TopicTreeNodeRowProps {
  node: TopicHierarchyNode;
  depth: number;
  parentPath: string[];
  recordsByTopic: Map<string, DatasetRecord[]>;
  descendantCounts: Map<string, number>;
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

  // Build the full path including this node
  const currentPath = [...parentPath, node.name];

  return (
    <div className="relative">
      {/* Node header - breadcrumb style */}
      <button
        className={cn(
          "w-full flex items-center gap-2 py-2.5 px-4 text-left transition-colors",
          "hover:bg-muted/30 border-b border-border/30",
          hasContent ? "cursor-pointer" : "cursor-default opacity-50"
        )}
        onClick={() => hasContent && setIsExpanded(!isExpanded)}
        disabled={!hasContent}
      >
        {/* Expand/collapse chevron */}
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          {hasContent ? (
            <ChevronRight
              className={cn(
                "w-3.5 h-3.5 text-zinc-500 transition-transform duration-200",
                isExpanded && "rotate-90"
              )}
            />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
          )}
        </span>

        {/* Breadcrumb path */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {currentPath.map((segment, index) => {
            const isLast = index === currentPath.length - 1;
            return (
              <span key={index} className="flex items-center gap-1.5 shrink-0">
                {index > 0 && (
                  <ChevronRight className="w-3 h-3 text-zinc-600" />
                )}
                <span
                  className={cn(
                    "text-xs",
                    isLast
                      ? "font-semibold text-emerald-400"
                      : "text-zinc-500"
                  )}
                >
                  {segment}
                </span>
              </span>
            );
          })}
        </div>

        {/* Record count */}
        <span className={cn(
          "text-xs tabular-nums shrink-0 min-w-[2rem] text-right",
          totalCount > 0 ? "text-zinc-300" : "text-zinc-600"
        )}>
          {totalCount}
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && hasContent && (
        <div className="bg-muted/10">
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
            <div className="p-2 space-y-2">
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
