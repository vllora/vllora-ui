/**
 * TopicNodeComponent
 *
 * Custom React Flow node for displaying a topic in the hierarchy canvas.
 * Shows topic name, record count, and can expand to show RecordsTable.
 * Supports resizing when expanded.
 * Uses TopicCanvasContext for state and handlers.
 */

import { memo, useState } from "react";
import { Handle, Position, type Node, type NodeProps, NodeResizer } from "@xyflow/react";
import { Table2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTopicCanvas } from "./TopicCanvasContext";
import { RecordsTable } from "../records-table";

export interface TopicNodeData extends Record<string, unknown> {
  name: string;
  topicKey: string; // Key for looking up in context (e.g., "root" or topic name)
  nodeId: string; // Node ID for expansion tracking
  recordCount: number;
  isRoot?: boolean;
  hasChildren?: boolean;
}

// Define the full node type for React Flow
export type TopicNode = Node<TopicNodeData, "topic">;

// Default sizes
const COLLAPSED_WIDTH = 280;
const DEFAULT_EXPANDED_WIDTH = 700;
const DEFAULT_EXPANDED_HEIGHT = 500;
const MIN_WIDTH = 450; // Flex-based columns scale down better
const MIN_HEIGHT = 300;
const HEADER_HEIGHT = 60;

export const TopicNodeComponent = memo(function TopicNodeComponent({
  data,
  selected = false,
}: NodeProps<TopicNode>) {
  const {
    name,
    topicKey,
    nodeId,
    recordCount,
    isRoot = false,
  } = data;

  // Track expanded size
  const [expandedSize, setExpandedSize] = useState({
    width: DEFAULT_EXPANDED_WIDTH,
    height: DEFAULT_EXPANDED_HEIGHT,
  });

  // Get state and handlers from context
  const {
    fullRecordsByTopic,
    datasetId,
    selectedTopic,
    setSelectedTopic,
    isNodeExpanded,
    toggleNodeExpansion,
    onUpdateRecordTopic,
    onDeleteRecord,
    onSaveRecord,
  } = useTopicCanvas();

  const isExpanded = isNodeExpanded(nodeId);
  const isSelected = isRoot ? selectedTopic === null : selectedTopic === name;
  const records = fullRecordsByTopic[topicKey] || [];

  // Handlers
  const handleSelect = () => {
    setSelectedTopic(isRoot ? null : name);
  };

  const handleResize = (_event: unknown, params: { width: number; height: number }) => {
    setExpandedSize({
      width: params.width,
      height: params.height,
    });
  };

  const tableHeight = expandedSize.height - HEADER_HEIGHT;

  return (
    <div
      className={cn(
        "relative rounded border bg-card shadow-md transition-all nopan",
        isSelected
          ? "border-[rgb(var(--theme-500))] shadow-[rgb(var(--theme-500))]/20 shadow-lg"
          : "border-border hover:border-[rgb(var(--theme-500))]/50",
        isRoot && "border-[rgb(var(--theme-500))]"
      )}
      style={{
        width: isExpanded ? expandedSize.width : COLLAPSED_WIDTH,
        height: isExpanded ? expandedSize.height : 'auto',
      }}
    >
      {/* Resizer - visible only when node is selected and expanded */}
      {isExpanded && (
        <NodeResizer
          minWidth={MIN_WIDTH}
          minHeight={MIN_HEIGHT}
          onResize={handleResize}
          isVisible={selected}
          lineClassName="!border-[rgb(var(--theme-500))]"
          handleClassName="!w-2 !h-2 !bg-[rgb(var(--theme-500))] !border-none"
        />
      )}

      {/* Input handle (not for root) */}
      {!isRoot && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-border !border-2 !border-background"
        />
      )}

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-border !border-2 !border-background"
      />

      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3",
          isExpanded && "border-b border-border"
        )}
        style={{ height: HEADER_HEIGHT }}
      >
        {/* Icon */}
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
            isRoot
              ? "bg-[rgb(var(--theme-500))]/15 text-[rgb(var(--theme-500))]"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Table2 className="w-4 h-4" />
        </div>

        {/* Title - nopan nodrag allows clicks on non-draggable nodes */}
        <div className="flex-1 min-w-0 nodrag nopan">
          <button
            type="button"
            onClick={handleSelect}
            className={cn(
              "font-semibold text-sm transition-colors truncate block text-left w-full cursor-pointer",
              isRoot
                ? "text-[rgb(var(--theme-500))]"
                : "text-foreground hover:text-[rgb(var(--theme-500))]"
            )}
          >
            {name}
          </button>
          {!isExpanded && (
            <p className="text-xs text-muted-foreground">
              {recordCount.toLocaleString()} record{recordCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Expand/Collapse chevron */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            toggleNodeExpansion(nodeId);
          }}
          className="flex-shrink-0 p-1 rounded-md hover:bg-muted transition-colors cursor-pointer nodrag nopan text-muted-foreground hover:text-foreground"
          style={{ pointerEvents: 'auto' }}
          title={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Expanded RecordsTable */}
      {isExpanded && (
        <div
          className="nodrag nopan nowheel overflow-hidden"
          style={{ height: tableHeight, minWidth: 0 }}
        >
          <RecordsTable
            records={records}
            datasetId={datasetId}
            height={tableHeight}
            showFooter
            emptyMessage="No records in this topic"
            onUpdateTopic={onUpdateRecordTopic || (async () => {})}
            onDelete={onDeleteRecord || (() => {})}
            onSave={onSaveRecord}
          />
        </div>
      )}
    </div>
  );
});
