/**
 * TopicNodeComponent
 *
 * Custom React Flow node for displaying a topic in the hierarchy canvas.
 * Acts as a wrapper that handles shared logic (selection, handles, toolbar)
 * and delegates rendering to CollapsedTopicNode or ExpandedTopicNode.
 */

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import { TopicCanvasConsumer } from "../TopicCanvasContext";
import { TopicNodeToolbar } from "../TopicNodeToolbar";
import { CollapsedTopicNode } from "./CollapsedTopicNode";
import { ExpandedTopicNode } from "./ExpandedTopicNode";

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

  // Get state and handlers from context
  const {
    recordsByTopic,
    datasetId,
    availableTopics,
    coverageStats,
    selectedTopic,
    setSelectedTopic,
    isNodeExpanded,
    toggleNodeExpansion,
    setNodeSize,
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

  // Compute coverage percentage from coverageStats
  // coverageStats.topicDistribution has counts per topic, totalRecords has total
  const coveragePercentage = coverageStats && coverageStats.totalRecords > 0 && !isRoot
    ? ((coverageStats.topicDistribution[topicKey] || 0) / coverageStats.totalRecords) * 100
    : undefined;

  // Handlers
  const handleSelect = () => {
    setSelectedTopic(isRoot ? "__root__" : name);
  };

  const handleToggleExpansion = () => {
    toggleNodeExpansion(nodeId);
  };

  const handleResize = (width: number, height: number) => {
    setNodeSize(nodeId, width, height);
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
          isExpanded={isExpanded}
          onDeleteTopic={onDeleteTopic}
          onToggleExpansion={toggleNodeExpansion}
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

      {/* Render collapsed or expanded state */}
      {isExpanded ? (
        <ExpandedTopicNode
          name={name}
          recordCount={recordCount}
          isRoot={isRoot}
          isSelected={isSelected}
          isReactFlowSelected={selected}
          records={records}
          datasetId={datasetId}
          availableTopics={availableTopics}
          onToggleExpansion={handleToggleExpansion}
          onResize={handleResize}
          onRename={handleRename}
          onUpdateRecordTopic={onUpdateRecordTopic}
          onDeleteRecord={onDeleteRecord}
          onSaveRecord={onSaveRecord}
        />
      ) : (
        <CollapsedTopicNode
          name={name}
          recordCount={recordCount}
          isRoot={isRoot}
          isSelected={isSelected}
          coveragePercentage={coveragePercentage}
          onToggleExpansion={handleToggleExpansion}
          onRename={handleRename}
        />
      )}
    </div>
  );
});
