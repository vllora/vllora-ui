/**
 * TopicTreeNodeRow
 *
 * Renders a single node in the topic record tree with breadcrumb path display.
 * Used by TopicRecordTree to display hierarchical topic groupings.
 */

import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { RecordRow } from "./RecordRow";
import type { AvailableTopic } from "./record-utils";

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
  availableTopics,
}: TopicTreeNodeRowProps) {
  const [isExpanded, setIsExpanded] = useState(true); // Expand all by default

  const hasChildren = node.children && node.children.length > 0;
  const records = recordsByTopic.get(node.name) || [];
  const hasRecords = records.length > 0;
  const hasContent = hasChildren || hasRecords;
  const totalCount = descendantCounts.get(node.id) || 0;

  // Build the full path including this node
  const currentPath = [...parentPath, node.name];

  return (
    <div className="relative">
      {/* Node header - breadcrumb style */}
      <button
        className={cn(
          "w-full flex items-center gap-3 py-3 px-4 text-left transition-colors",
          "hover:bg-muted/40 border-b border-border/50",
          hasContent ? "cursor-pointer" : "cursor-default opacity-60"
        )}
        onClick={() => hasContent && setIsExpanded(!isExpanded)}
        disabled={!hasContent}
      >
        {/* Expand/collapse chevron */}
        <span className="w-5 h-5 flex items-center justify-center shrink-0">
          {hasContent ? (
            <ChevronDown
              className={cn(
                "w-4 h-4 text-muted-foreground transition-transform duration-200",
                !isExpanded && "-rotate-90"
              )}
            />
          ) : null}
        </span>

        {/* Breadcrumb path */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {currentPath.map((segment, index) => {
            const isLast = index === currentPath.length - 1;
            return (
              <span key={index} className="flex items-center gap-2 shrink-0">
                {index > 0 && (
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                )}
                <span
                  className={cn(
                    "text-xs uppercase tracking-wide",
                    isLast
                      ? "font-bold text-emerald-500"
                      : "font-medium text-muted-foreground"
                  )}
                >
                  {segment}
                </span>
              </span>
            );
          })}
        </div>

        {/* Record count badge */}
        {totalCount > 0 && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-500 text-xs tracking-wider shrink-0">
            <span>{totalCount.toLocaleString()}</span>
            <span className="text-emerald-500">records</span>
          </span>
        )}
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
                availableTopics={availableTopics}
              />
            ))}

          {/* Records at this node (only shown for leaf nodes) */}
          {hasRecords && (
            <div className="p-2 space-y-2">
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
      )}
    </div>
  );
}
