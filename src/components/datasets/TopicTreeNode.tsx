/**
 * TopicTreeNode
 *
 * Recursive tree node component for rendering topic hierarchy.
 * Supports inline editing, adding children, and deleting nodes.
 */

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Tag,
  Pencil,
  Plus,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TopicHierarchyNode } from "@/types/dataset-types";

export interface TopicTreeNodeProps {
  node: TopicHierarchyNode;
  level: number;
  maxDepth: number;
  expandedNodes: Set<string>;
  toggleNode: (nodeId: string) => void;
  onUpdateName: (nodeId: string, newName: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (nodeId: string) => void;
  /** Map of topic name -> record count */
  topicCounts?: Map<string, number>;
}

export function TopicTreeNode({
  node,
  level,
  maxDepth,
  expandedNodes,
  toggleNode,
  onUpdateName,
  onAddChild,
  onDelete,
  topicCounts,
}: TopicTreeNodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.name);
  const [isHovered, setIsHovered] = useState(false);

  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const canAddChildren = level < maxDepth - 1;
  const recordCount = topicCounts?.get(node.name) || 0;

  const handleSaveEdit = () => {
    if (editValue.trim()) {
      onUpdateName(node.id, editValue.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditValue(node.name);
    setIsEditing(false);
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(node.name);
    setIsEditing(true);
  };

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-1 py-1.5 px-2 rounded-md transition-colors group",
          isHovered && "bg-muted/50"
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Expand/collapse icon */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) toggleNode(node.id);
          }}
          className={cn(
            "w-4 h-4 flex items-center justify-center shrink-0",
            !hasChildren && "invisible"
          )}
        >
          {hasChildren &&
            (isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            ))}
        </button>

        {/* Folder/tag icon */}
        {hasChildren ? (
          isExpanded ? (
            <FolderOpen className="w-4 h-4 text-[rgb(var(--theme-500))] shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-[rgb(var(--theme-500))] shrink-0" />
          )
        ) : (
          <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}

        {/* Node name or edit input */}
        {isEditing ? (
          <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="h-6 text-sm py-0 px-2"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveEdit();
                if (e.key === "Escape") handleCancelEdit();
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-green-500 hover:text-green-600 hover:bg-green-500/10"
              onClick={handleSaveEdit}
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              onClick={handleCancelEdit}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <>
            <span className="text-sm truncate flex-1">{node.name}</span>
            {recordCount > 0 && (
              <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50 shrink-0">
                {recordCount}
              </span>
            )}

            {/* Action buttons - visible on hover */}
            <div className={cn(
              "flex items-center gap-0.5 transition-opacity",
              isHovered ? "opacity-100" : "opacity-0"
            )}>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={handleStartEdit}
                title="Edit name"
              >
                <Pencil className="w-3 h-3" />
              </Button>
              {canAddChildren && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-[rgb(var(--theme-500))]"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddChild(node.id);
                    // Auto-expand when adding child
                    if (!isExpanded) toggleNode(node.id);
                  }}
                  title="Add child topic"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(node.id);
                }}
                title="Delete topic"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <TopicTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              maxDepth={maxDepth}
              expandedNodes={expandedNodes}
              toggleNode={toggleNode}
              onUpdateName={onUpdateName}
              onAddChild={onAddChild}
              onDelete={onDelete}
              topicCounts={topicCounts}
            />
          ))}
        </div>
      )}
    </div>
  );
}
