/**
 * TopicHierarchyDialog
 *
 * Dialog for configuring and generating a topic hierarchy for a dataset.
 * Allows users to describe dataset goals, set hierarchy depth, generate
 * a topic tree, and manually edit the hierarchy.
 *
 * Changes are auto-saved with debouncing (500ms) - no explicit save button needed.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tag, Zap, Loader2, Plus, Wand2, Check, AlertTriangle } from "lucide-react";
import {
  TopicHierarchyConfig,
  TopicHierarchyNode,
} from "@/types/dataset-types";
import { TopicTreeNode } from "./TopicTreeNode";
import {
  countNodes,
  getAllNodeIds,
  cloneHierarchy,
  findNodeById,
  updateNodeName,
  addChildToNode,
  deleteNode,
  getLeafNamesFromNode,
} from "./topic-hierarchy-utils";

/**
 * Empty state component shown when no hierarchy is configured
 */
function EmptyHierarchyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
      <Tag className="w-8 h-8 mb-2 opacity-50" />
      <p>No hierarchy yet</p>
      <p className="text-xs mt-1">
        Generate from goals or add categories manually
      </p>
    </div>
  );
}

interface TopicHierarchyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current topic hierarchy config from the dataset */
  initialConfig?: TopicHierarchyConfig;
  /** Called when hierarchy changes (auto-saved with debouncing) */
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
  /** Number of records that have topics assigned */
  recordsWithTopicsCount?: number;
  /** Called to clear all record topics after new hierarchy is generated */
  onClearRecordTopics?: () => Promise<void>;
  /** Called when a topic is renamed to update records with that topic */
  onRenameTopic?: (oldName: string, newName: string) => Promise<void>;
  /** Called when a topic node is deleted to clear topics from records */
  onDeleteTopic?: (topicNames: string[]) => Promise<void>;
}

const AUTO_SAVE_DEBOUNCE_MS = 500;

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
  recordsWithTopicsCount = 0,
  onClearRecordTopics,
  onRenameTopic,
  onDeleteTopic,
}: TopicHierarchyDialogProps) {
  // Form state
  const [goals, setGoals] = useState(initialConfig?.goals || "");
  const [depth, setDepth] = useState(initialConfig?.depth || 3);

  // Preview state
  const [hierarchy, setHierarchy] = useState<TopicHierarchyNode[]>(
    initialConfig?.hierarchy || []
  );
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track if user has made any edits (to distinguish from initial state setup)
  const hasUserEdited = useRef(false);
  // Track previous open state to detect dialog open transition
  const wasOpen = useRef(false);
  // Stable ref for onApply to avoid effect re-triggers when parent recreates callback
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;

  // Reset state only when dialog transitions from closed to open
  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;

    if (justOpened) {
      setGoals(initialConfig?.goals || "");
      setDepth(initialConfig?.depth || 3);
      setHierarchy(initialConfig?.hierarchy ? cloneHierarchy(initialConfig.hierarchy) : []);
      // Expand all nodes by default
      if (initialConfig?.hierarchy) {
        setExpandedNodes(new Set(getAllNodeIds(initialConfig.hierarchy)));
      } else {
        setExpandedNodes(new Set());
      }
      // Reset save status and edit tracking
      setSaveStatus("idle");
      hasUserEdited.current = false;
    }
  }, [open, initialConfig]);

  // Auto-save with debouncing when hierarchy changes
  // Goals and depth are just generation config - only save when hierarchy is modified
  useEffect(() => {
    // Skip if dialog is closed
    if (!open) return;

    // Skip auto-save until user has made an edit
    if (!hasUserEdited.current) return;

    // Clear any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Set saving status immediately to show user something is happening
    setSaveStatus("saving");

    // Debounce the actual save
    debounceRef.current = setTimeout(() => {
      const config: TopicHierarchyConfig = {
        goals,
        depth,
        hierarchy,
        generatedAt: Date.now(),
      };
      onApplyRef.current(config);
      setSaveStatus("saved");

      // Reset to idle after showing "saved" for a moment
      setTimeout(() => setSaveStatus("idle"), 1500);
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // Only trigger on hierarchy changes, not goals/depth/onApply
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hierarchy, open]);

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
    hasUserEdited.current = true;
    // Find old name before updating, so we can rename records with that topic
    const oldNode = findNodeById(hierarchy, nodeId);
    const oldName = oldNode?.name;
    setHierarchy((prev) => updateNodeName(prev, nodeId, newName));
    // Rename records that had the old topic name
    if (oldName && oldName !== newName && onRenameTopic) {
      onRenameTopic(oldName, newName);
    }
  }, [hierarchy, onRenameTopic]);

  const handleAddChild = useCallback((parentId: string) => {
    hasUserEdited.current = true;
    const newChild: TopicHierarchyNode = {
      id: crypto.randomUUID(),
      name: "New Topic",
    };
    setHierarchy((prev) => addChildToNode(prev, parentId, newChild));
    // Expand the new node's ID so user can see it
    setExpandedNodes((prev) => new Set([...prev, newChild.id]));
  }, []);

  const handleDelete = useCallback((nodeId: string) => {
    hasUserEdited.current = true;
    // Find the node being deleted to get all its leaf topic names
    const nodeToDelete = findNodeById(hierarchy, nodeId);
    if (nodeToDelete && onDeleteTopic) {
      const leafNames = getLeafNamesFromNode(nodeToDelete);
      onDeleteTopic(leafNames);
    }
    setHierarchy((prev) => deleteNode(prev, nodeId));
  }, [hierarchy, onDeleteTopic]);

  const handleAddRootTopic = useCallback(() => {
    hasUserEdited.current = true;
    const newNode: TopicHierarchyNode = {
      id: crypto.randomUUID(),
      name: "New Category",
    };
    setHierarchy((prev) => [...prev, newNode]);
    setExpandedNodes((prev) => new Set([...prev, newNode.id]));
  }, []);

  const handleGenerate = async () => {
    hasUserEdited.current = true;
    const generatedHierarchy = await onGenerate(goals, depth);
    if (generatedHierarchy.length > 0) {
      setHierarchy(generatedHierarchy);
      // Expand all nodes
      const allIds = getAllNodeIds(generatedHierarchy);
      setExpandedNodes(new Set(allIds));
      // Clear record topics since hierarchy changed
      if (onClearRecordTopics) {
        await onClearRecordTopics();
      }
    }
  };

  const nodeCount = countNodes(hierarchy);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl h-[70vh] p-0 gap-0 flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
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
                <EmptyHierarchyState />
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

        {/* Footer with action buttons */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
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
            {recordsWithTopicsCount > 0 && !isGenerating && (
              <span className="text-xs text-amber-600 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Will clear topics from {recordsWithTopicsCount} record{recordsWithTopicsCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Auto-save status indicator */}
            {saveStatus !== "idle" && (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                {saveStatus === "saving" ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-3 h-3 text-green-500" />
                    Saved
                  </>
                )}
              </span>
            )}
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
