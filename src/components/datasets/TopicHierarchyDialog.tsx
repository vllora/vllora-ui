/**
 * TopicHierarchyDialog
 *
 * Dialog for configuring and generating a topic hierarchy for a dataset.
 * Allows users to describe dataset goals, set hierarchy depth, generate
 * a topic tree, and manually edit the hierarchy before saving.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tag, Zap, Loader2, Plus, Save, Wand2 } from "lucide-react";
import {
  TopicHierarchyConfig,
  TopicHierarchyNode,
} from "@/types/dataset-types";
import { TopicTreeNode } from "./TopicTreeNode";
import {
  countNodes,
  getAllNodeIds,
  cloneHierarchy,
  updateNodeName,
  addChildToNode,
  deleteNode,
} from "./topic-hierarchy-utils";

interface TopicHierarchyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current topic hierarchy config from the dataset */
  initialConfig?: TopicHierarchyConfig;
  /** Called when user clicks "Save" */
  onApply: (config: TopicHierarchyConfig) => void;
  /** Called to generate hierarchy (should call LLM) */
  onGenerate: (goals: string, depth: number) => Promise<TopicHierarchyNode[]>;
  /** Whether generation is in progress */
  isGenerating?: boolean;
  /** Called to auto-tag records based on the hierarchy */
  onAutoTag?: () => Promise<void>;
  /** Whether auto-tagging is in progress */
  isAutoTagging?: boolean;
  /** Number of records that will be tagged */
  recordCount?: number;
  /** Map of topic name -> record count */
  topicCounts?: Map<string, number>;
}

export function TopicHierarchyDialog({
  open,
  onOpenChange,
  initialConfig,
  onApply,
  onGenerate,
  isGenerating = false,
  onAutoTag,
  isAutoTagging = false,
  recordCount = 0,
  topicCounts,
}: TopicHierarchyDialogProps) {
  // Form state
  const [goals, setGoals] = useState(initialConfig?.goals || "");
  const [depth, setDepth] = useState(initialConfig?.depth || 3);

  // Preview state
  const [hierarchy, setHierarchy] = useState<TopicHierarchyNode[]>(
    initialConfig?.hierarchy || []
  );
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Reset state when dialog opens with new config
  useEffect(() => {
    if (open) {
      setGoals(initialConfig?.goals || "");
      setDepth(initialConfig?.depth || 3);
      setHierarchy(initialConfig?.hierarchy ? cloneHierarchy(initialConfig.hierarchy) : []);
      // Expand all nodes by default
      if (initialConfig?.hierarchy) {
        setExpandedNodes(new Set(getAllNodeIds(initialConfig.hierarchy)));
      } else {
        setExpandedNodes(new Set());
      }
    }
  }, [open, initialConfig]);

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleUpdateName = useCallback((nodeId: string, newName: string) => {
    setHierarchy((prev) => updateNodeName(prev, nodeId, newName));
  }, []);

  const handleAddChild = useCallback((parentId: string) => {
    const newChild: TopicHierarchyNode = {
      id: crypto.randomUUID(),
      name: "New Topic",
    };
    setHierarchy((prev) => addChildToNode(prev, parentId, newChild));
    // Expand the new node's ID so user can see it
    setExpandedNodes((prev) => new Set([...prev, newChild.id]));
  }, []);

  const handleDelete = useCallback((nodeId: string) => {
    setHierarchy((prev) => deleteNode(prev, nodeId));
  }, []);

  const handleAddRootTopic = useCallback(() => {
    const newNode: TopicHierarchyNode = {
      id: crypto.randomUUID(),
      name: "New Category",
    };
    setHierarchy((prev) => [...prev, newNode]);
    setExpandedNodes((prev) => new Set([...prev, newNode.id]));
  }, []);

  const handleGenerate = async () => {
    const generatedHierarchy = await onGenerate(goals, depth);
    setHierarchy(generatedHierarchy);
    // Expand all nodes
    const allIds = getAllNodeIds(generatedHierarchy);
    setExpandedNodes(new Set(allIds));
  };

  const handleSave = () => {
    const config: TopicHierarchyConfig = {
      goals,
      depth,
      hierarchy,
      generatedAt: Date.now(),
    };
    onApply(config);
  };

  const nodeCount = countNodes(hierarchy);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[70vh] p-0 gap-0 flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[rgb(var(--theme-500))]/10 flex items-center justify-center">
              <Tag className="w-4 h-4 text-[rgb(var(--theme-500))]" />
            </div>
            <DialogTitle className="text-lg">
              Configure Topic Hierarchy
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel - Configuration */}
          <div className="w-1/2 p-6 border-r border-border flex flex-col gap-6 overflow-y-auto">
            {/* Goals textarea */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Describe your dataset goals
              </label>
              <Textarea
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                placeholder="e.g., Focus on technical support and error resolution. Highlight common error codes, troubleshooting steps, and customer sentiment for hardware failures..."
                className="min-h-[120px] resize-none bg-muted/30 border-border/50"
              />
              <p className="text-xs text-muted-foreground">
                The LLM uses this context to generate relevant topic categories.
              </p>
            </div>

            {/* Depth slider */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Hierarchy Depth</label>
                <span className="text-sm font-medium px-2.5 py-0.5 rounded-full bg-[rgb(var(--theme-500))]/10 text-[rgb(var(--theme-500))]">
                  {depth} Level{depth !== 1 ? "s" : ""}
                </span>
              </div>
              <Slider
                value={[depth]}
                onValueChange={([value]) => setDepth(value)}
                min={1}
                max={5}
                step={1}
                className="[&_[role=slider]]:bg-[rgb(var(--theme-500))] [&_[role=slider]]:border-[rgb(var(--theme-500))] [&_.bg-primary]:bg-[rgb(var(--theme-500))]"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Flat (1)</span>
                <span>Deep (5)</span>
              </div>
            </div>
          </div>

          {/* Right panel - Live Preview */}
          <div className="w-1/2 flex flex-col bg-muted/20">
            {/* Preview header */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Hierarchy Preview
              </span>
              <div className="flex items-center gap-2">
                {isGenerating && (
                  <div className="flex items-center gap-2 text-xs text-[rgb(var(--theme-500))]">
                    <div className="w-2 h-2 rounded-full bg-[rgb(var(--theme-500))] animate-pulse" />
                    Processing...
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleAddRootTopic}
                >
                  <Plus className="w-3 h-3" />
                  Add Category
                </Button>
              </div>
            </div>

            {/* Tree view */}
            <div className="flex-1 overflow-y-auto p-2">
              {hierarchy.length > 0 ? (
                hierarchy.map((node) => (
                  <TopicTreeNode
                    key={node.id}
                    node={node}
                    level={0}
                    maxDepth={depth}
                    expandedNodes={expandedNodes}
                    toggleNode={toggleNode}
                    onUpdateName={handleUpdateName}
                    onAddChild={handleAddChild}
                    onDelete={handleDelete}
                    topicCounts={topicCounts}
                  />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
                  <Tag className="w-8 h-8 mb-2 opacity-50" />
                  <p>No hierarchy yet</p>
                  <p className="text-xs mt-1">
                    Generate from goals or add categories manually
                  </p>
                </div>
              )}
            </div>

            {/* Preview footer stats */}
            <div className="px-4 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                {nodeCount} topic{nodeCount !== 1 ? "s" : ""} {recordCount > 0 && `· ${recordCount} records`}
              </span>
            </div>
          </div>
        </div>

        {/* Footer with all action buttons */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between flex-shrink-0">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            variant="outline"
            className="gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Generate Hierarchy
              </>
            )}
          </Button>
          <div className="flex items-center gap-2">
            {onAutoTag && (
              <Button
                onClick={onAutoTag}
                disabled={hierarchy.length === 0 || isAutoTagging || recordCount === 0}
                variant="outline"
                className="gap-2"
              >
                {isAutoTagging ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Tagging...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    Auto-tag Records
                  </>
                )}
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={hierarchy.length === 0}
              className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white gap-2"
            >
              <Save className="w-4 h-4" />
              Save Hierarchy
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
