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

export interface TopicRecord {
  id: string;
  input?: string;
  output?: string;
  topic?: string;
}

interface TopicCanvasContextType {
  // Records data
  records: DatasetRecord[];
  recordsByTopic: Record<string, TopicRecord[]>;
  /** Full DatasetRecord objects grouped by topic (for RecordsTable) */
  fullRecordsByTopic: Record<string, DatasetRecord[]>;
  datasetId?: string;

  // Selection state
  selectedTopic: string | null;
  setSelectedTopic: (topic: string | null) => void;

  // Expanded state
  expandedNodes: Set<string>;
  toggleNodeExpansion: (nodeId: string) => void;
  isNodeExpanded: (nodeId: string) => boolean;

  // Topic handlers
  onAddTopic?: (parentTopicName: string | null) => void;
  onRenameTopic?: (topicName: string) => void;
  onDeleteTopic?: (topicName: string) => void;

  // Record handlers (for RecordsTable)
  onUpdateRecordTopic?: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  onDeleteRecord?: (recordId: string) => void;
  onSaveRecord?: (recordId: string, data: unknown) => Promise<void>;
}

// ============================================================================
// Context
// ============================================================================

const TopicCanvasContext = createContext<TopicCanvasContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface TopicCanvasProviderProps {
  children: ReactNode;
  records: DatasetRecord[];
  datasetId?: string;
  selectedTopic?: string | null;
  onSelectTopic?: (topicName: string | null) => void;
  onAddTopic?: (parentTopicName: string | null) => void;
  onRenameTopic?: (topicName: string) => void;
  onDeleteTopic?: (topicName: string) => void;
  // Record handlers
  onUpdateRecordTopic?: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  onDeleteRecord?: (recordId: string) => void;
  onSaveRecord?: (recordId: string, data: unknown) => Promise<void>;
}

export function TopicCanvasProvider({
  children,
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
}: TopicCanvasProviderProps) {
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

  // Group records by topic (simplified TopicRecord for quick preview)
  const recordsByTopic = useMemo(() => {
    const grouped: Record<string, TopicRecord[]> = { __all__: [] };
    for (const record of records) {
      // Extract input/output from record.data if it's a DataInfo object
      const data = record.data as {
        input?: { messages?: Array<{ content?: string }> };
        output?: { content?: string };
      } | undefined;
      const inputContent = data?.input?.messages?.[0]?.content;
      const outputContent = data?.output?.content;

      const topicRecord: TopicRecord = {
        id: record.id,
        input: inputContent,
        output: outputContent,
        topic: record.topic,
      };
      grouped.__all__.push(topicRecord);
      if (record.topic) {
        if (!grouped[record.topic]) {
          grouped[record.topic] = [];
        }
        grouped[record.topic].push(topicRecord);
      }
    }
    return grouped;
  }, [records]);

  // Group full DatasetRecord objects by topic (for RecordsTable)
  const fullRecordsByTopic = useMemo(() => {
    const grouped: Record<string, DatasetRecord[]> = { __all__: [...records] };
    for (const record of records) {
      if (record.topic) {
        if (!grouped[record.topic]) {
          grouped[record.topic] = [];
        }
        grouped[record.topic].push(record);
      }
    }
    return grouped;
  }, [records]);

  const value: TopicCanvasContextType = {
    records,
    recordsByTopic,
    fullRecordsByTopic,
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

  return (
    <TopicCanvasContext.Provider value={value}>
      {children}
    </TopicCanvasContext.Provider>
  );
}

// ============================================================================
// Consumer
// ============================================================================

export function useTopicCanvas() {
  const context = useContext(TopicCanvasContext);
  if (context === undefined) {
    throw new Error("useTopicCanvas must be used within a TopicCanvasProvider");
  }
  return context;
}
