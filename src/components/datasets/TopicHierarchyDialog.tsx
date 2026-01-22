/**
 * TopicHierarchyDialog
 *
 * Dialog for configuring and generating a topic hierarchy for a dataset.
 * Features a two-panel layout:
 * - Left: Searchable topic tree
 * - Right: Smart Topic Generator with AI controls
 *
 * Changes are auto-saved with debouncing (500ms).
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Sparkles, Loader2, Plus, Check, Search, ChevronRight, RefreshCw } from "lucide-react";
import {
  TopicHierarchyConfig,
  TopicHierarchyNode,
} from "@/types/dataset-types";
import { TopicTreeNode } from "./TopicTreeNode";
import { type AutoTagProgress } from "./AutoTagButton";
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

interface TopicHierarchyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConfig?: TopicHierarchyConfig;
  onApply: (config: TopicHierarchyConfig) => void;
  onGenerate: (goals: string, depth: number) => Promise<TopicHierarchyNode[]>;
  isGenerating?: boolean;
  onAutoTag?: () => Promise<void>;
  isAutoTagging?: boolean;
  autoTagProgress?: AutoTagProgress | null;
  recordCount?: number;
  topicCounts?: Map<string, number>;
  recordsWithTopicsCount?: number;
  onClearRecordTopics?: () => Promise<void>;
  onRenameTopic?: (oldName: string, newName: string) => Promise<void>;
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
  autoTagProgress,
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
  const [searchQuery, setSearchQuery] = useState("");

  // Hierarchy state
  const [hierarchy, setHierarchy] = useState<TopicHierarchyNode[]>(
    initialConfig?.hierarchy || []
  );
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUserEdited = useRef(false);
  const wasOpen = useRef(false);
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const initialConfigRef = useRef(initialConfig);
  initialConfigRef.current = initialConfig;

  // Calculate unlabeled percentage
  const unlabeledPercent = recordCount > 0
    ? Math.round(((recordCount - recordsWithTopicsCount) / recordCount) * 100)
    : 0;

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

  // Reset state when dialog opens
  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;

    if (justOpened) {
      const config = initialConfigRef.current;
      setGoals(config?.goals || "");
      setDepth(config?.depth || 3);
      setHierarchy(config?.hierarchy ? cloneHierarchy(config.hierarchy) : []);
      setSearchQuery("");
      if (config?.hierarchy) {
        setExpandedNodes(new Set(getAllNodeIds(config.hierarchy)));
      } else {
        setExpandedNodes(new Set());
      }
      setSaveStatus("idle");
      hasUserEdited.current = false;
    }
  }, [open]);

  // Auto-save with debouncing
  useEffect(() => {
    if (!open) return;
    if (!hasUserEdited.current) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    setSaveStatus("saving");

    debounceRef.current = setTimeout(() => {
      const config: TopicHierarchyConfig = {
        goals,
        depth,
        hierarchy,
        generatedAt: Date.now(),
      };
      onApplyRef.current(config);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [hierarchy, open, goals, depth]);

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
    const oldNode = findNodeById(hierarchy, nodeId);
    const oldName = oldNode?.name;
    setHierarchy((prev) => updateNodeName(prev, nodeId, newName));
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
    setExpandedNodes((prev) => new Set([...prev, newChild.id]));
  }, []);

  const handleDelete = useCallback((nodeId: string) => {
    hasUserEdited.current = true;
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
      const allIds = getAllNodeIds(generatedHierarchy);
      setExpandedNodes(new Set(allIds));
      if (onClearRecordTopics) {
        await onClearRecordTopics();
      }
    }
  };

  const nodeCount = countNodes(hierarchy);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl h-[80vh] p-0 gap-0 flex flex-col overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Main content - two panel layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel - Topic Hierarchy Tree */}
          <div className="w-1/2 flex flex-col border-r border-border">
            {/* Search input */}
            <div className="p-4 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search hierarchy..."
                  className="pl-9 bg-muted/30 border-border/50"
                />
              </div>
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
                      maxDepth={depth}
                      expandedNodes={expandedNodes}
                      toggleNode={toggleNode}
                      onUpdateName={handleUpdateName}
                      onAddChild={handleAddChild}
                      onDelete={handleDelete}
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

            {/* Add root topic button */}
            <div className="p-4 border-t border-border">
              <button
                onClick={handleAddRootTopic}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Manual Root Topic
              </button>
            </div>
          </div>

          {/* Right panel - Smart Topic Generator */}
          <div className="w-1/2 flex flex-col overflow-y-auto bg-muted/5">
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Smart Topic Generator</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Describe how you want to organize your dataset. The AI will analyze your LLM traces and propose a hierarchical structure.
                  </p>
                </div>
              </div>

              {/* Agent Instructions */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Agent Instructions
                </label>
                <Textarea
                  value={goals}
                  onChange={(e) => {
                    hasUserEdited.current = true;
                    setGoals(e.target.value);
                  }}
                  placeholder="e.g. Group these by chess strategy and openings. Create a nested structure for beginner vs advanced tactics based on Elo rating tags."
                  className="min-h-[120px] resize-none bg-muted/30 border-border/50 text-sm"
                />
              </div>

              {/* Parameters */}
              <div className="space-y-3">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Parameters
                </label>
                <div className="p-4 rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-muted-foreground">MAX DEPTH</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
                      Level {depth}
                    </span>
                  </div>
                  <Slider
                    value={[depth]}
                    onValueChange={([value]) => {
                      hasUserEdited.current = true;
                      setDepth(value);
                    }}
                    min={1}
                    max={5}
                    step={1}
                    className="[&_[role=slider]]:bg-emerald-500 [&_[role=slider]]:border-emerald-500 [&_.bg-primary]:bg-emerald-500"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>1</span>
                    <span>2</span>
                    <span>3</span>
                    <span>4</span>
                    <span>5</span>
                  </div>
                </div>
              </div>

              {/* Generate button */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full h-10 bg-emerald-500 hover:bg-emerald-600 text-white gap-2 text-sm font-medium"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    GENERATE WITH AI
                  </>
                )}
              </Button>

              {/* Categorize Records section */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Categorize Records
                </label>

                {/* Apply to Unlabeled Records */}
                <button
                  onClick={onAutoTag}
                  disabled={hierarchy.length === 0 || recordCount === 0 || isAutoTagging || unlabeledPercent === 0}
                  className="w-full p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">Apply to Unlabeled Records</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {isAutoTagging && autoTagProgress ? (
                          `Processing ${autoTagProgress.completed}/${autoTagProgress.total}...`
                        ) : (
                          `Map the remaining ${unlabeledPercent}% of unlabeled records to the new hierarchy structure.`
                        )}
                      </div>
                    </div>
                    {isAutoTagging ? (
                      <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                    )}
                  </div>
                </button>

                {/* Recategorize All Current Records */}
                <button
                  onClick={async () => {
                    if (onClearRecordTopics) {
                      await onClearRecordTopics();
                    }
                    if (onAutoTag) {
                      await onAutoTag();
                    }
                  }}
                  disabled={hierarchy.length === 0 || recordCount === 0 || isAutoTagging}
                  className="w-full p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">Recategorize All Current Records</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Reset and re-assign all dataset records based on the updated categories and AI logic.
                      </div>
                    </div>
                    <RefreshCw className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                  </div>
                </button>
              </div>

              {/* Status indicators */}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                <span>
                  {nodeCount} topic{nodeCount !== 1 ? "s" : ""} {recordCount > 0 && `· ${recordCount} records`}
                </span>
                {saveStatus !== "idle" && (
                  <span className="flex items-center gap-1.5">
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
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
