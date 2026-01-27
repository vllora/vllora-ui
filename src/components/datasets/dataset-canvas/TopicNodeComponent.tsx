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
import { Table2, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopicCanvasConsumer } from "./TopicCanvasContext";
import { RecordsTable } from "../records-table";
import { TopicNodeToolbar } from "./TopicNodeToolbar";

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
    hasChildren = false,
  } = data;

  // Track expanded size
  const [expandedSize, setExpandedSize] = useState({
    width: DEFAULT_EXPANDED_WIDTH,
    height: DEFAULT_EXPANDED_HEIGHT,
  });

  // Get state and handlers from context
  const {
    recordsByTopic,
    datasetId,
    selectedTopic,
    setSelectedTopic,
    isNodeExpanded,
    toggleNodeExpansion,
    setNodeSize,
    onAddTopic,
    onRenameTopic,
    onDeleteTopic,
    onUpdateRecordTopic,
    onDeleteRecord,
    onSaveRecord,
    startAddingTopic,
    pendingAddParentId,
  } = TopicCanvasConsumer();

  const isExpanded = isNodeExpanded(nodeId);
  // Use "__root__" as special value for root selection, null means nothing selected
  const isSelected = isRoot ? selectedTopic === "__root__" : selectedTopic === name;
  const records = recordsByTopic[topicKey] || [];

  // Handlers
  const handleSelect = () => {
    // Use "__root__" as special value for root selection
    setSelectedTopic(isRoot ? "__root__" : name);
  };

  const handleResize = (_event: unknown, params: { width: number; height: number }) => {
    setExpandedSize({
      width: params.width,
      height: params.height,
    });
    // Report size change to context for layout recalculation
    setNodeSize(nodeId, params.width, params.height);
  };

  const tableHeight = expandedSize.height - HEADER_HEIGHT;

  return (
    <div
      onClick={handleSelect}
      className={cn(
        "relative rounded-xl border-[0.5px]  transition-all nopan cursor-pointer",
        isSelected
          ? "border-[rgb(var(--theme-500))]"
          : "border-border hover:border-emerald-500/50",
        !isExpanded ? "bg-[#111113]" : "bg-background"
      )}
      style={{
        width: isExpanded ? expandedSize.width : COLLAPSED_WIDTH,
        height: isExpanded ? expandedSize.height : 'auto',
        boxShadow: isSelected
          ? '0 0 15px rgba(16, 185, 129, 0.2), 0 0 30px rgba(16, 185, 129, 0.1)'
          : undefined,
      }}
    >
      {/* Floating toolbar - appears above selected node */}
      {isSelected && (
        <TopicNodeToolbar
          name={name}
          nodeId={nodeId}
          isRoot={isRoot}
          isExpanded={isExpanded}
          onAddTopic={onAddTopic}
          onRenameTopic={onRenameTopic}
          onDeleteTopic={onDeleteTopic}
          onToggleExpansion={toggleNodeExpansion}
        />
      )}

      {/* Resizer - visible only when node is selected and expanded */}
      {isExpanded && (
        <NodeResizer
          minWidth={MIN_WIDTH}
          minHeight={MIN_HEIGHT}
          onResize={handleResize}
          isVisible={selected}
          lineClassName="!border-transparent"
          handleClassName="!w-3 !h-3 !rounded-full !bg-[rgb(var(--theme-500))] !border-1 !border-background !shadow-md"
        />
      )}

      {/* Input handle (not for root) - Left side for horizontal layout */}
      {!isRoot && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-border !border-1 !border-background"
        />
      )}

      {/* Output handle - Right side for horizontal layout
          Show when: has children OR is parent of pending input node */}
      {(hasChildren || (isRoot ? pendingAddParentId === null : pendingAddParentId === name)) && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-border !border-1 !border-background"
        />
      )}

      {/* Floating + button for adding child topic - shows on right side when selected and no pending add */}
      {isSelected && pendingAddParentId === undefined && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            startAddingTopic(isRoot ? null : name);
          }}
          className="absolute -right-3 top-1/2 -translate-y-1/2 translate-x-full w-6 h-6 rounded-md border border-border bg-background text-muted-foreground flex items-center justify-center hover:border-[rgb(var(--theme-500))] hover:text-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-500))]/10 transition-colors nodrag nopan"
          title="Add child topic"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}

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

        {/* Title - draggable area */}
        <div className="flex-1 min-w-0">
          <span
            className={cn(
              "font-semibold text-sm transition-colors truncate block text-left w-full",
              isRoot
                ? "text-[rgb(var(--theme-500))]"
                : "text-foreground"
            )}
          >
            {name}
          </span>
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
          className="flex-shrink-0 p-1 rounded-md hover:bg-muted transition-colors cursor-pointer nodrag text-muted-foreground hover:text-foreground"
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
          onClick={(e) => e.stopPropagation()}
          className="nowheel overflow-hidden"
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
