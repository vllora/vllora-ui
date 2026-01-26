/**
 * TopicHierarchyTreePanel
 *
 * Left panel of TopicHierarchyDialog showing searchable topic tree.
 */

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Search, Plus, Sparkles } from "lucide-react";
import { TopicHierarchyNode } from "@/types/dataset-types";
import { TopicTreeNode } from "./TopicTreeNode";

export interface TopicHierarchyTreePanelProps {
  hierarchy: TopicHierarchyNode[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  expandedNodes: Set<string>;
  onToggleNode: (nodeId: string) => void;
  onUpdateName: (nodeId: string, newName: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (nodeId: string) => void;
  onAddRootTopic: () => void;
  maxDepth: number;
  topicCounts?: Map<string, number>;
}

export function TopicHierarchyTreePanel({
  hierarchy,
  searchQuery,
  onSearchChange,
  expandedNodes,
  onToggleNode,
  onUpdateName,
  onAddChild,
  onDelete,
  onAddRootTopic,
  maxDepth,
  topicCounts,
}: TopicHierarchyTreePanelProps) {
  // Filter hierarchy based on search query
  const filteredHierarchy = useMemo(() => {
    if (!searchQuery.trim()) return hierarchy;
    const query = searchQuery.toLowerCase();

    const filterNodes = (nodes: TopicHierarchyNode[]): TopicHierarchyNode[] => {
      const result: TopicHierarchyNode[] = [];
      for (const node of nodes) {
        const matchesSearch = node.name.toLowerCase().includes(query);
        const filteredChildren = node.children ? filterNodes(node.children) : [];

        if (matchesSearch || filteredChildren.length > 0) {
          result.push({
            ...node,
            children: filteredChildren.length > 0 ? filteredChildren : node.children,
          });
        }
      }
      return result;
    };

    return filterNodes(hierarchy);
  }, [hierarchy, searchQuery]);

  return (
    <div className="w-1/2 flex flex-col border-r border-border">
      {/* Search input and add button */}
      <div className="p-4 border-b border-border flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search hierarchy..."
            className="pl-9 bg-muted/30 border-border/50"
          />
        </div>
        <button
          onClick={onAddRootTopic}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
          title="Create Manual Root Topic"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Topic</span>
        </button>
      </div>

      {/* Tree view */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredHierarchy.length > 0 ? (
          <div className="space-y-1">
            {filteredHierarchy.map((node, index) => (
              <TopicTreeNode
                key={node.id}
                node={node}
                level={0}
                maxDepth={maxDepth}
                expandedNodes={expandedNodes}
                toggleNode={onToggleNode}
                onUpdateName={onUpdateName}
                onAddChild={onAddChild}
                onDelete={onDelete}
                topicCounts={topicCounts}
                isLast={index === filteredHierarchy.length - 1}
              />
            ))}
          </div>
        ) : searchQuery ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Search className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm">No topics match "{searchQuery}"</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium">No hierarchy yet</p>
            <p className="text-xs mt-1 text-muted-foreground/70">Generate with AI or add topics manually</p>
          </div>
        )}
      </div>
    </div>
  );
}
