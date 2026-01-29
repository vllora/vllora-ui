/**
 * TopicNodeComponent
 *
 * Custom React Flow node for displaying a topic in the hierarchy canvas.
 * Acts as a wrapper that handles shared logic (selection, handles, toolbar)
 * and renders CollapsedTopicNode. Clicking expand opens a modal dialog.
 */

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import { TopicCanvasConsumer } from "../TopicCanvasContext";
import { TopicNodeToolbar } from "../TopicNodeToolbar";
import { CollapsedTopicNode } from "./CollapsedTopicNode";

export interface TopicNodeData extends Record<string, unknown> {
  name: string;
  topicKey: string; // Key for looking up in context (e.g., "root" or topic name)
  nodeId: string; // Node ID for expansion tracking
  recordCount: number;
  aggregatedRecordCount?: number; // Sum of all descendants (for non-leaf coverage display)
  isRoot?: boolean;
  hasChildren?: boolean;
}

// Define the full node type for React Flow
export type TopicNode = Node<TopicNodeData, "topic">;

export const TopicNodeComponent = memo(function TopicNodeComponent({
  data,
}: NodeProps<TopicNode>) {
  const {
    name,
    topicKey,
    nodeId,
    recordCount,
    aggregatedRecordCount,
    isRoot = false,
    hasChildren = false,
  } = data;

  // Get state and handlers from context
  const {
    recordsByTopic,
    totalRecordCount,
    selectedTopic,
    setSelectedTopic,
    onRenameTopic,
    onDeleteTopic,
    startAddingTopic,
    pendingAddParentId,
    openTopicModal,
  } = TopicCanvasConsumer();

  // Use "__root__" as special value for root selection, null means nothing selected
  const isSelected = isRoot ? selectedTopic === "__root__" : selectedTopic === name;
  const records = recordsByTopic[topicKey] || [];

  // Compute coverage percentage:
  // - For leaf topics: use direct record count (records assigned to this topic)
  // - For non-leaf topics: use aggregated count (sum of all descendant leaves)
  // This ensures non-leaf topics show meaningful coverage instead of always 0%
  const coveragePercentage = totalRecordCount > 0 && !isRoot
    ? ((hasChildren ? (aggregatedRecordCount ?? 0) : records.length) / totalRecordCount) * 100
    : undefined;

  // Handlers
  const handleSelect = () => {
    setSelectedTopic(isRoot ? "__root__" : name);
  };

  const handleOpenModal = () => {
    // Open the modal dialog with records for this topic
    // Use topicKey for looking up records (name for leaf topics, "__unassigned__" for root)
    openTopicModal(topicKey);
  };

  const handleRename = (newName: string) => {
    if (onRenameTopic && !isRoot) {
      // Pass both old name and new name for the rename operation
      onRenameTopic(name, newName);
    }
  };

  return (
    <div onClick={handleSelect} className="relative nopan cursor-pointer">
      {/* Floating toolbar - appears above selected node */}
      {isSelected && (
        <TopicNodeToolbar
          name={name}
          nodeId={nodeId}
          isRoot={isRoot}
          isExpanded={false}
          onDeleteTopic={onDeleteTopic}
          onViewRecords={handleOpenModal}
        />
      )}

      {/* Input handle (not for root) - Left side for horizontal layout */}
      {!isRoot && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-1.5 !h-1.5 !bg-emerald-500/50 !border-0 !min-w-0 !min-h-0"
        />
      )}

      {/* Output handle - Right side for horizontal layout
          Show when: has children OR is parent of pending input node */}
      {(hasChildren || (isRoot ? pendingAddParentId === null : pendingAddParentId === name)) && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-1.5 !h-1.5 !bg-emerald-500/50 !border-0 !min-w-0 !min-h-0"
        />
      )}

      {/* Floating + button for adding child topic */}
      {isSelected && pendingAddParentId === undefined && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            startAddingTopic(isRoot ? null : name);
          }}
          className="absolute -right-3 top-1/2 -translate-y-1/2 translate-x-full w-6 h-6 rounded-md border border-border bg-background text-muted-foreground flex items-center justify-center hover:border-[rgb(var(--theme-500))] hover:text-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-500))]/10 transition-colors nodrag nopan z-10"
          title="Add child topic"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Render collapsed node - clicking expand opens modal dialog */}
      <CollapsedTopicNode
        name={name}
        recordCount={recordCount}
        aggregatedRecordCount={hasChildren ? aggregatedRecordCount : undefined}
        isRoot={isRoot}
        isSelected={isSelected}
        coveragePercentage={coveragePercentage}
        onViewRecords={handleOpenModal}
        onRename={handleRename}
      />
    </div>
  );
});
