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
import { Table2, ChevronDown, ChevronUp, Plus, Pencil, Trash2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopicCanvasConsumer } from "./TopicCanvasContext";
import { RecordsTable } from "../records-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
    onAddTopic,
    onRenameTopic,
    onDeleteTopic,
    onUpdateRecordTopic,
    onDeleteRecord,
    onSaveRecord,
  } = TopicCanvasConsumer();

  const isExpanded = isNodeExpanded(nodeId);
  const isSelected = isRoot ? selectedTopic === null : selectedTopic === name;
  const records = recordsByTopic[topicKey] || [];

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
      onClick={handleSelect}
      className={cn(
        "relative rounded-xl border-[0.5px] bg-card transition-all nopan cursor-pointer",
        isSelected
          ? "border-[rgb(var(--theme-500))]"
          : "border-border hover:border-emerald-500/50",
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
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-12 z-10 nodrag nopan"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-popover border border-border shadow-lg">
            {/* Add subtopic button */}
            {onAddTopic && (
              <button
                type="button"
                onClick={() => onAddTopic(isRoot ? null : name)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Add subtopic"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            )}

            {/* Rename button (not for root) */}
            {!isRoot && onRenameTopic && (
              <button
                type="button"
                onClick={() => onRenameTopic(name)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Rename topic"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Rename</span>
              </button>
            )}

            {/* Delete button (not for root) */}
            {!isRoot && onDeleteTopic && (
              <button
                type="button"
                onClick={() => onDeleteTopic(name)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                title="Delete topic"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}

            {/* More options dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="More options"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[160px]">
                <DropdownMenuItem onClick={() => toggleNodeExpansion(nodeId)}>
                  {isExpanded ? "Collapse" : "Expand"} node
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  Export records...
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Resizer - visible only when node is selected and expanded */}
      {isExpanded && (
        <NodeResizer
          minWidth={MIN_WIDTH}
          minHeight={MIN_HEIGHT}
          onResize={handleResize}
          isVisible={selected}
          lineClassName="!border-transparent"
          handleClassName="!w-3 !h-3 !rounded-full !bg-[rgb(var(--theme-500))] !border-2 !border-background !shadow-md"
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

      {/* Output handle (only if node has children) */}
      {hasChildren && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-border !border-2 !border-background"
        />
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
          onClick={(e) => e.stopPropagation()}
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
