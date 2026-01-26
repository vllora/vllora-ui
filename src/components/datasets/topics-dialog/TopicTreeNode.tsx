/**
 * TopicTreeNode
 *
 * Recursive tree node component for rendering topic hierarchy.
 * Supports inline editing, adding children, and deleting nodes.
 */

import { useState } from "react";
import {
  Pencil,
  Plus,
  Trash2,
  Check,
  X,
  ChevronRight,
  FolderOpen,
  Folder,
  FileText,
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
  topicCounts?: Map<string, number>;
  isLast?: boolean;
}

function formatRecordCount(count: number): string {
  return count.toLocaleString();
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
  isLast = false,
}: TopicTreeNodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.name);
  const [isHovered, setIsHovered] = useState(false);

  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const canAddChildren = level < maxDepth - 1;

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

  // Calculate total records including children
  const getTotalRecords = (n: TopicHierarchyNode): number => {
    let total = topicCounts?.get(n.name) || 0;
    if (n.children) {
      for (const child of n.children) {
        total += getTotalRecords(child);
      }
    }
    return total;
  };

  const totalRecords = getTotalRecords(node);

  // Get icon based on node type
  const getNodeIcon = () => {
    if (hasChildren) {
      return isExpanded ? (
        <FolderOpen className="w-4 h-4 text-amber-500" />
      ) : (
        <Folder className="w-4 h-4 text-amber-500" />
      );
    }
    return <FileText className="w-4 h-4 text-emerald-500" />;
  };

  return (
    <div className="select-none">
      {/* Tree connector lines for nested items */}
      <div
        className={cn(
          "relative flex items-center",
          level > 0 && "ml-6"
        )}
      >
        {/* Vertical and horizontal connector lines */}
        {level > 0 && (
          <>
            {/* Horizontal line */}
            <div className="absolute left-0 top-1/2 w-4 h-px bg-border -translate-x-4" />
            {/* Vertical line */}
            <div
              className={cn(
                "absolute -left-4 top-0 w-px bg-border",
                isLast ? "h-1/2" : "h-full"
              )}
            />
          </>
        )}

        {/* Node content */}
        <div
          className={cn(
            "flex-1 flex items-center gap-2 py-2 px-3 rounded-lg transition-all duration-150 group cursor-pointer",
            "border border-transparent",
            isHovered && "bg-muted/50 border-border/50",
            level === 0 && "bg-gradient-to-r from-muted/30 to-transparent"
          )}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={() => hasChildren && toggleNode(node.id)}
        >
          {/* Expand/collapse chevron */}
          <div className="w-4 h-4 flex items-center justify-center">
            {hasChildren ? (
              <ChevronRight
                className={cn(
                  "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
                  isExpanded && "rotate-90"
                )}
              />
            ) : null}
          </div>

          {/* Node icon */}
          {getNodeIcon()}

          {/* Node name or edit input */}
          {isEditing ? (
            <div className="flex items-center gap-1.5 flex-1" onClick={(e) => e.stopPropagation()}>
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-7 text-sm py-0 px-2 bg-background border-emerald-500/50 focus-visible:ring-emerald-500/30"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") handleCancelEdit();
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
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
              <span className={cn(
                "text-sm truncate flex-1 transition-colors",
                level === 0 ? "font-semibold" : "font-medium",
                isHovered && "text-foreground"
              )}>
                {node.name}
              </span>

              {/* Record count badge */}
              {totalRecords > 0 && (
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full shrink-0 font-medium transition-colors",
                  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                )}>
                  {formatRecordCount(totalRecords)}
                </span>
              )}

              {/* Action buttons - visible on hover */}
              <div className={cn(
                "flex items-center gap-0.5 transition-all duration-150",
                isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2"
              )}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                  onClick={handleStartEdit}
                  title="Edit name"
                >
                  <Pencil className="w-3 h-3" />
                </Button>
                {canAddChildren && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddChild(node.id);
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
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
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
      </div>

      {/* Children with animation */}
      {hasChildren && isExpanded && (
        <div className={cn(
          "relative",
          level > 0 && "ml-6"
        )}>
          {/* Continuous vertical line for children */}
          {level > 0 && !isLast && (
            <div className="absolute -left-4 top-0 w-px h-full bg-border" />
          )}
          <div className="space-y-0.5">
            {node.children!.map((child, index) => (
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
                isLast={index === node.children!.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
