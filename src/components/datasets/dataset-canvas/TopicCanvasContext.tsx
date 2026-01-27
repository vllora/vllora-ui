/**
 * TopicCanvasContext
 *
 * Context for managing topic canvas state and handlers.
 * Uses Provider/Consumer pattern to avoid prop drilling through React Flow nodes.
 */

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import type { DatasetRecord } from "@/types/dataset-types";

// ============================================================================
// Types
// ============================================================================

export interface TopicCanvasProviderProps {
  children: ReactNode;
  records: DatasetRecord[];
  datasetId?: string;
  selectedTopic?: string | null;
  onSelectTopic?: (topicName: string | null) => void;
  onAddTopic?: (parentTopicName: string | null) => void;
  onRenameTopic?: (topicName: string) => void;
  onDeleteTopic?: (topicName: string) => void;
  onUpdateRecordTopic?: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  onDeleteRecord?: (recordId: string) => void;
  onSaveRecord?: (recordId: string, data: unknown) => Promise<void>;
}

// ============================================================================
// Hook - Core logic
// ============================================================================

function useTopicCanvas(props: Omit<TopicCanvasProviderProps, "children">) {
  const {
    records,
    datasetId,
    selectedTopic: externalSelectedTopic,
    onSelectTopic,
    onAddTopic,
    onRenameTopic,
    onDeleteTopic,
    onUpdateRecordTopic,
    onDeleteRecord,
    onSaveRecord,
  } = props;

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

  return {
    records,
    recordsByTopic,
    datasetId,
    selectedTopic,
    setSelectedTopic,
    expandedNodes,
    toggleNodeExpansion,
    isNodeExpanded,
    onAddTopic,
    onRenameTopic,
    onDeleteTopic,
    onUpdateRecordTopic,
    onDeleteRecord,
    onSaveRecord,
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
