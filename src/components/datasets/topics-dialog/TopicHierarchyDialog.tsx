/**
 * TopicHierarchyDialog
 *
 * Dialog for configuring and generating a topic hierarchy for a dataset.
 * Features a two-panel layout:
 * - Left: Searchable topic tree (TopicHierarchyTreePanel)
 * - Right: Smart Topic Generator with AI controls (TopicGeneratorPanel)
 *
 * Changes are auto-saved with debouncing (500ms).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  TopicHierarchyConfig,
  TopicHierarchyNode,
} from "@/types/dataset-types";
import { type AutoTagProgress } from "../AutoTagButton";
import { TopicHierarchyTreePanel } from "./TopicHierarchyTreePanel";
import { TopicGeneratorPanel } from "./TopicGeneratorPanel";
import {
  countNodes,
  getAllNodeIds,
  cloneHierarchy,
  findNodeById,
  updateNodeName,
  addChildToNode,
  deleteNode,
  getLeafNamesFromNode,
} from "../topic-hierarchy-utils";

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

  const handleGoalsChange = useCallback((newGoals: string) => {
    hasUserEdited.current = true;
    setGoals(newGoals);
  }, []);

  const handleDepthChange = useCallback((newDepth: number) => {
    hasUserEdited.current = true;
    setDepth(newDepth);
  }, []);

  const handleRecategorizeAll = useCallback(async () => {
    if (onClearRecordTopics) {
      await onClearRecordTopics();
    }
    if (onAutoTag) {
      await onAutoTag();
    }
  }, [onClearRecordTopics, onAutoTag]);

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
          <TopicHierarchyTreePanel
            hierarchy={hierarchy}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            expandedNodes={expandedNodes}
            onToggleNode={toggleNode}
            onUpdateName={handleUpdateName}
            onAddChild={handleAddChild}
            onDelete={handleDelete}
            onAddRootTopic={handleAddRootTopic}
            maxDepth={depth}
            topicCounts={topicCounts}
          />

          {/* Right panel - Smart Topic Generator */}
          <TopicGeneratorPanel
            goals={goals}
            onGoalsChange={handleGoalsChange}
            depth={depth}
            onDepthChange={handleDepthChange}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
            onAutoTag={onAutoTag}
            isAutoTagging={isAutoTagging}
            autoTagProgress={autoTagProgress}
            onRecategorizeAll={handleRecategorizeAll}
            nodeCount={nodeCount}
            recordCount={recordCount}
            unlabeledPercent={unlabeledPercent}
            hierarchyLength={hierarchy.length}
            saveStatus={saveStatus}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
