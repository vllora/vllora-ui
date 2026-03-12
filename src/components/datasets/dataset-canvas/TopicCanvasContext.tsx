/**
 * TopicCanvasContext
 *
 * Context for managing topic canvas state and handlers.
 * Uses Provider/Consumer pattern to avoid prop drilling through React Flow nodes.
 *
 * P0-2: Canvas search/filter state
 * P0-6: Preview mode state
 * P0-15: Operation/loading state
 */

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import type { DatasetRecord, TopicHierarchyNode, CoverageStats } from "@/types/dataset-types";
import { getLeafTopicsFromHierarchy } from "../record-utils";
import { filterRecords, type RecordFilterOptions, type RecordRole } from "../record-filters";
import { emitter } from "@/utils/eventEmitter";

// ============================================================================
// Types
// ============================================================================

/** P0-2: Score filter presets for canvas toolbar */
export type ScoreFilter = "all" | "high" | "low" | "unevaluated";

/** P0-15: Operation progress for canvas banner */
export interface CanvasOperationProgress {
  type: "generation" | "import" | "evaluation";
  status: "started" | "progress" | "completed" | "failed";
  completed?: number;
  total?: number;
  /** Topic being operated on (for per-node indicators) */
  topicName?: string;
}

export interface TopicCanvasProviderProps {
  children: ReactNode;
  records: DatasetRecord[];
  workflowId?: string;
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
  /** Called when user wants to generate subtopics for a topic (null = root level) */
  onGenerateSubtopics?: (topicId: string | null) => void;
  /** Called when a record is selected for detail view (opens Sheet) */
  onSelectRecordId?: (id: string | null) => void;
  /** Called when user wants to view the current topic in table view */
  onViewInTable?: (topicId: string) => void;
  /** Dataset training objective (used for system prompt segment display on nodes) */
  datasetObjective?: string;
  /** Per-topic quality scores for canvas node display */
  topicQualityScores?: Record<string, { avg: number; count: number; evaluated: number }>;
}

// ============================================================================
// Hook - Core logic
// ============================================================================

function useTopicCanvas(props: Omit<TopicCanvasProviderProps, "children">) {
  const {
    records,
    workflowId,
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
    onGenerateSubtopics,
    datasetObjective,
    topicQualityScores,
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
  // Full dialog mode (vs slide-in panel)
  const [isFullDialogMode, setIsFullDialogMode] = useState(false);

  const openTopicModal = useCallback((topicId: string) => {
    setViewingTopicId(topicId);
  }, []);

  const closeTopicModal = useCallback(() => {
    setViewingTopicId(null);
    setIsFullDialogMode(false);
  }, []);

  const openFullDialog = useCallback(() => {
    setIsFullDialogMode(true);
  }, []);

  const closeFullDialog = useCallback(() => {
    setIsFullDialogMode(false);
  }, []);

  /** Get previous and next sibling topic IDs for panel navigation */
  const getSiblingTopics = useCallback((topicId: string): { prev: string | null; next: string | null } => {
    if (!hierarchy) return { prev: null, next: null };

    // Build a flat list of all topic IDs in hierarchy order (DFS)
    const flatIds: string[] = [];
    const collectIds = (nodes: TopicHierarchyNode[]) => {
      for (const node of nodes) {
        flatIds.push(node.id || node.name);
        if (node.children && node.children.length > 0) {
          collectIds(node.children);
        }
      }
    };
    collectIds(hierarchy);

    // Add __unassigned__ at the end
    flatIds.push("__unassigned__");

    const idx = flatIds.indexOf(topicId);
    if (idx === -1) return { prev: null, next: null };

    return {
      prev: idx > 0 ? flatIds[idx - 1] : null,
      next: idx < flatIds.length - 1 ? flatIds[idx + 1] : null,
    };
  }, [hierarchy]);

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

  // =========================================================================
  // P0-2: Canvas search/filter state
  // =========================================================================

  const [searchQuery, setSearchQuery] = useState("");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [canvasRoleFilter, setCanvasRoleFilter] = useState<RecordRole>("all");

  // Compute which topics match the search query (searches topic names, not record content)
  const matchingTopics = useMemo(() => {
    if (!searchQuery) return null;
    const query = searchQuery.toLowerCase();
    const matches = new Set<string>();
    for (const topic of Object.keys(recordsByTopic)) {
      if (topic !== "__unassigned__" && topic.toLowerCase().includes(query)) {
        matches.add(topic);
      }
    }
    return matches;
  }, [recordsByTopic, searchQuery]);

  // Compute filtered records per topic based on score filter and role filter
  const filteredRecordsByTopic = useMemo(() => {
    if (scoreFilter === "all" && canvasRoleFilter === "all") return null; // No record filter active

    const filterOptions: RecordFilterOptions = {};
    if (canvasRoleFilter !== "all") {
      filterOptions.role = canvasRoleFilter;
    } else if (scoreFilter === "high") {
      filterOptions.role = "evaluated";
    } else if (scoreFilter === "unevaluated") {
      filterOptions.role = "training";
    }

    const result: Record<string, DatasetRecord[]> = {};
    for (const [topic, topicRecords] of Object.entries(recordsByTopic)) {
      let filtered = filterRecords(topicRecords, filterOptions);

      // Additional score-specific filtering
      if (scoreFilter === "high") {
        filtered = filtered.filter(r => (r.evaluation?.score ?? 0) >= 0.8);
      } else if (scoreFilter === "low") {
        filtered = filtered.filter(r =>
          r.evaluation?.score !== undefined && r.evaluation.score < 0.5
        );
      }

      result[topic] = filtered;
    }
    return result;
  }, [recordsByTopic, scoreFilter, canvasRoleFilter]);

  // Check if a filter is currently active
  const isFilterActive = searchQuery !== "" || scoreFilter !== "all" || canvasRoleFilter !== "all";

  // Get matching record count for a topic (when record filter is active)
  const getMatchingCount = useCallback(
    (topicId: string): number | null => {
      if (!filteredRecordsByTopic) return null;
      return filteredRecordsByTopic[topicId]?.length ?? 0;
    },
    [filteredRecordsByTopic]
  );

  // Check if a topic matches the search query
  const isTopicMatchingSearch = useCallback(
    (topicName: string): boolean => {
      if (!matchingTopics) return true; // No search = all match
      return matchingTopics.has(topicName);
    },
    [matchingTopics]
  );

  // =========================================================================
  // P0-6: Preview mode state
  // =========================================================================

  const [showPreviews, setShowPreviews] = useState(false);

  const togglePreviews = useCallback(() => {
    setShowPreviews((prev) => !prev);
  }, []);

  // =========================================================================
  // P0-15: Operation/loading state
  // =========================================================================

  const [operationProgress, setOperationProgress] = useState<CanvasOperationProgress | null>(null);
  const [generatingTopicName, setGeneratingTopicName] = useState<string | null>(null);

  // Listen for data generation progress events
  useEffect(() => {
    const handleProgress = (event: {
      workflowId: string;
      status: 'started' | 'progress' | 'completed' | 'failed';
      completed?: number;
      total?: number;
      topicName?: string;
    }) => {
      if (workflowId && event.workflowId !== workflowId) return;

      if (event.status === 'started' || event.status === 'progress') {
        setOperationProgress({
          type: "generation",
          status: event.status,
          completed: event.completed,
          total: event.total,
          topicName: event.topicName,
        });
        if (event.topicName) {
          setGeneratingTopicName(event.topicName);
        }
      } else if (event.status === 'completed' || event.status === 'failed') {
        setOperationProgress(null);
        setGeneratingTopicName(null);
      }
    };

    emitter.on('vllora_data_generation_progress', handleProgress);
    return () => {
      emitter.off('vllora_data_generation_progress', handleProgress);
    };
  }, [workflowId]);

  return {
    hierarchy,
    records,
    recordsByTopic,
    totalRecordCount,
    workflowId,
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
    onGenerateSubtopics,
    // Inline topic creation
    pendingAddParentId,
    startAddingTopic,
    cancelAddingTopic,
    confirmAddingTopic,
    // Modal for viewing topic records
    viewingTopicId,
    openTopicModal,
    closeTopicModal,
    // Panel vs full dialog mode
    isFullDialogMode,
    openFullDialog,
    closeFullDialog,
    getSiblingTopics,
    // P0-2: Canvas search/filter
    searchQuery,
    setSearchQuery,
    scoreFilter,
    setScoreFilter,
    canvasRoleFilter,
    setCanvasRoleFilter,
    filteredRecordsByTopic,
    isFilterActive,
    getMatchingCount,
    matchingTopics,
    isTopicMatchingSearch,
    // P0-6: Preview mode
    showPreviews,
    togglePreviews,
    // P0-15: Operation/loading state
    operationProgress,
    generatingTopicName,
    // Record detail sidebar
    onSelectRecordId: props.onSelectRecordId,
    // View in table
    onViewInTable: props.onViewInTable,
    // Dataset objective (for system prompt segment display)
    datasetObjective,
    // Per-topic quality scores for node display
    topicQualityScores,
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
