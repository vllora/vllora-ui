/**
 * TopicCanvasContext
 *
 * Context for managing topic canvas state and handlers.
 * Uses Provider/Consumer pattern to avoid prop drilling through React Flow nodes.
 */

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import type { DatasetRecord, TopicHierarchyNode, CoverageStats } from "@/types/dataset-types";
import { getLeafTopicsFromHierarchy } from "../record-utils";

// ============================================================================
// Types
// ============================================================================

export interface TopicCanvasProviderProps {
  children: ReactNode;
  records: DatasetRecord[];
  datasetId?: string;
  /** Topic hierarchy for computing available topics */
  hierarchy?: TopicHierarchyNode[];
  /** Coverage stats for showing distribution info on nodes */
  coverageStats?: CoverageStats;
  selectedTopic?: string | null;
  onSelectTopic?: (topicName: string | null) => void;
  onAddTopic?: (parentTopicName: string | null) => void;
  /** Called when renaming a topic inline. Receives old name and new name. */
  onRenameTopic?: (oldName: string, newName: string) => void;
  onDeleteTopic?: (topicName: string) => void;
  onUpdateRecordTopic?: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  onDeleteRecord?: (recordId: string) => void;
  onSaveRecord?: (recordId: string, data: unknown) => Promise<void>;
  /** Called when creating a new child topic via inline input */
  onCreateChildTopic?: (parentTopicName: string | null, childTopicName: string) => void;
  /** Called when user wants to generate more data for a specific topic */
  onGenerateForTopic?: (topicName: string) => void;
}

// ============================================================================
// Hook - Core logic
// ============================================================================

function useTopicCanvas(props: Omit<TopicCanvasProviderProps, "children">) {
  const {
    records,
    datasetId,
    hierarchy,
    coverageStats,
    selectedTopic: externalSelectedTopic,
    onSelectTopic,
    onAddTopic,
    onRenameTopic,
    onDeleteTopic,
    onUpdateRecordTopic,
    onDeleteRecord,
    onSaveRecord,
    onCreateChildTopic,
    onGenerateForTopic,
  } = props;

  // Compute available topics from hierarchy (only leaf topics for assignment)
  const availableTopics = useMemo(
    () => getLeafTopicsFromHierarchy(hierarchy),
    [hierarchy]
  );

  // Internal selected topic state (controlled or uncontrolled)
  const [internalSelectedTopic, setInternalSelectedTopic] = useState<string | null>(null);
  const selectedTopic = externalSelectedTopic ?? internalSelectedTopic;

  const setSelectedTopic = useCallback(
    (topic: string | null) => {
      if (onSelectTopic) {
        onSelectTopic(topic);
      } else {
        setInternalSelectedTopic(topic);
      }
    },
    [onSelectTopic]
  );

  // Track which nodes are expanded
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Track actual sizes of expanded nodes (for layout calculation after resize)
  const [nodeSizes, setNodeSizes] = useState<Record<string, { width: number; height: number }>>({});

  const toggleNodeExpansion = useCallback((nodeId: string) => {
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

  // Update the size of a node (called when node is resized)
  const setNodeSize = useCallback((nodeId: string, width: number, height: number) => {
    setNodeSizes((prev) => ({
      ...prev,
      [nodeId]: { width, height },
    }));
  }, []);

  // Layout version to trigger manual relayout
  const [layoutVersion, setLayoutVersion] = useState(0);

  const triggerRelayout = useCallback(() => {
    setLayoutVersion((v) => v + 1);
  }, []);

  // Track pending inline topic creation (stores parent topic name, null for root)
  const [pendingAddParentId, setPendingAddParentId] = useState<string | null | undefined>(undefined);

  const startAddingTopic = useCallback((parentTopicName: string | null) => {
    setPendingAddParentId(parentTopicName);
  }, []);

  const cancelAddingTopic = useCallback(() => {
    setPendingAddParentId(undefined);
  }, []);

  const confirmAddingTopic = useCallback(
    (topicName: string) => {
      if (pendingAddParentId !== undefined && onCreateChildTopic) {
        onCreateChildTopic(pendingAddParentId, topicName);
      }
      setPendingAddParentId(undefined);
    },
    [pendingAddParentId, onCreateChildTopic]
  );

  // Modal for viewing topic records
  const [viewingTopicId, setViewingTopicId] = useState<string | null>(null);

  const openTopicModal = useCallback((topicId: string) => {
    setViewingTopicId(topicId);
  }, []);

  const closeTopicModal = useCallback(() => {
    setViewingTopicId(null);
  }, []);

  const isNodeExpanded = useCallback(
    (nodeId: string) => expandedNodes.has(nodeId),
    [expandedNodes]
  );

  // Group records by topic (__unassigned__ for records without a topic)
  const recordsByTopic = useMemo(() => {
    const grouped: Record<string, DatasetRecord[]> = { __unassigned__: [] };
    for (const record of records) {
      if (record.topic) {
        if (!grouped[record.topic]) {
          grouped[record.topic] = [];
        }
        grouped[record.topic].push(record);
      } else {
        grouped.__unassigned__.push(record);
      }
    }
    return grouped;
  }, [records]);

  // Total record count for computing coverage percentages
  const totalRecordCount = records.length;

  return {
    hierarchy,
    records,
    recordsByTopic,
    totalRecordCount,
    datasetId,
    availableTopics,
    coverageStats,
    selectedTopic,
    setSelectedTopic,
    expandedNodes,
    toggleNodeExpansion,
    isNodeExpanded,
    // Node sizes for layout calculation
    nodeSizes,
    setNodeSize,
    // Manual relayout trigger
    layoutVersion,
    triggerRelayout,
    onAddTopic,
    onRenameTopic,
    onDeleteTopic,
    onUpdateRecordTopic,
    onDeleteRecord,
    onSaveRecord,
    onGenerateForTopic,
    // Inline topic creation
    pendingAddParentId,
    startAddingTopic,
    cancelAddingTopic,
    confirmAddingTopic,
    // Modal for viewing topic records
    viewingTopicId,
    openTopicModal,
    closeTopicModal,
  };
}

// ============================================================================
// Context - Type inferred from hook
// ============================================================================

export type TopicCanvasContextType = ReturnType<typeof useTopicCanvas>;

const TopicCanvasContext = createContext<TopicCanvasContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

export function TopicCanvasProvider({ children, ...props }: TopicCanvasProviderProps) {
  const value = useTopicCanvas(props);
  return (
    <TopicCanvasContext.Provider value={value}>
      {children}
    </TopicCanvasContext.Provider>
  );
}

// ============================================================================
// Consumer
// ============================================================================

export function TopicCanvasConsumer() {
  const context = useContext(TopicCanvasContext);
  if (context === undefined) {
    throw new Error("TopicCanvasConsumer must be used within a TopicCanvasProvider");
  }
  return context;
}
