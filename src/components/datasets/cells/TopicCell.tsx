/**
 * TopicCell
 *
 * Displays and edits a record's topic with color-coded badge.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X, Tag, Plus, Minus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getTopicColor } from "../record-utils";

interface TopicCellProps {
  topic?: string;
  topicPath?: string[];
  topicPaths?: string[][];
  onUpdate: (topic: string) => Promise<void>;
  /** Whether to show the "Topic:" label prefix */
  showLabel?: boolean;
  /** Fixed width layout for table view */
  tableLayout?: boolean;
}

export function TopicCell({
  topic,
  topicPath,
  topicPaths,
  onUpdate,
  showLabel = false,
  tableLayout = false,
}: TopicCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingValue, setEditingValue] = useState("");
  const [pathExpanded, setPathExpanded] = useState(false);

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditingValue(topic || "");
  };

  const handleSave = async () => {
    await onUpdate(editingValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingValue("");
  };

  const hasPath = topicPath && topicPath.length > 0;
  const fullPath = hasPath ? topicPath!.join(" / ") : undefined;
  const previewPath = hasPath && topicPath!.length > 2
    ? `${topicPath![0]} / … / ${topicPath![topicPath!.length - 1]}`
    : fullPath;
  const displayTopic = topic || (hasPath ? topicPath![0] : undefined);

  type TreeNode = { label: string; children: Map<string, TreeNode> };
  const buildTree = (paths: string[][]): TreeNode[] => {
    const roots = new Map<string, TreeNode>();
    for (const rawPath of paths) {
      const path = rawPath.filter(Boolean);
      if (path.length === 0) continue;
      let currentMap = roots;
      let currentNode: TreeNode | undefined;
      for (const segment of path) {
        let node = currentMap.get(segment);
        if (!node) {
          node = { label: segment, children: new Map() };
          currentMap.set(segment, node);
        }
        currentNode = node;
        currentMap = node.children;
      }
    }
    return Array.from(roots.values());
  };

  const treeRoots = topicPaths && topicPaths.length > 0 ? buildTree(topicPaths) : undefined;

  return (
    <div
      className={cn(
        "flex items-center gap-2 shrink-0",
        tableLayout ? "w-40 justify-center" : "min-w-[160px] flex-col items-start"
      )}
    >
      {showLabel && (
        <span className="text-xs text-muted-foreground">Topic:</span>
      )}
      {isEditing ? (
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Input
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            className="h-7 w-28 text-xs bg-background"
            placeholder="Enter topic..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-green-500 hover:text-green-600 hover:bg-green-500/10"
            onClick={handleSave}
          >
            <Check className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleCancel}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : topic ? (
        <div className={cn("flex flex-col gap-1", tableLayout ? "items-center" : "items-start")}> 
          <button
            className={cn(
              "text-[11px] font-medium px-2.5 py-1 rounded-full transition-all hover:opacity-80",
              getTopicColor(displayTopic || topic)
            )}
            onClick={handleStartEdit}
            title={fullPath ? `Edit topic (path: ${fullPath})` : "Click to edit topic"}
          >
            {displayTopic}
          </button>
          {hasPath && topicPath!.length > 1 && (
            <div className="flex flex-col gap-1 text-[11px] text-muted-foreground/80 leading-tight w-full">
              <div className="flex items-center gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded border border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                        onClick={() => setPathExpanded((v) => !v)}
                        aria-label={pathExpanded ? "Collapse hierarchy" : "Expand hierarchy"}
                      >
                        {pathExpanded ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{pathExpanded ? "Collapse hierarchy" : "Expand hierarchy"}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span title={fullPath}>
                  {pathExpanded ? "Hierarchy" : (previewPath || fullPath || "—")}
                </span>
              </div>
              {pathExpanded && (
                <div className="ml-2 flex flex-col gap-1" title={fullPath}>
                  {(treeRoots && treeRoots.length > 0
                    ? treeRoots
                    : hasPath
                      ? buildTree([topicPath!])
                      : []
                  ).map((root) => {
                    const renderNode = (node: TreeNode, depth: number) => {
                      const childNodes = Array.from(node.children.values());
                      return (
                        <div key={`${node.label}-${depth}`} className="flex flex-col">
                          <div
                            className={cn(
                              "flex items-center gap-2 text-[11px] text-muted-foreground/80",
                              depth === 0 && "text-foreground font-medium"
                            )}
                            style={{ marginLeft: depth * 12 }}
                          >
                            <span className="text-border">{depth === 0 ? "•" : "↳"}</span>
                            <span>{node.label}</span>
                          </div>
                          {childNodes.map((c) => renderNode(c, depth + 1))}
                        </div>
                      );
                    };

                    return renderNode(root, 0);
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors group"
          onClick={handleStartEdit}
          title="Click to add topic"
        >
          <Tag className="w-3 h-3 group-hover:text-[rgb(var(--theme-500))]" />
          <span className="group-hover:text-[rgb(var(--theme-500))]">Add</span>
        </button>
      )}
    </div>
  );
}
