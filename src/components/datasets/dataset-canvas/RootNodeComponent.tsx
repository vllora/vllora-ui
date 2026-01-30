/**
 * RootNodeComponent
 *
 * Compact root node displayed when all records are assigned to topics.
 * Shows as a small pill with icon and label.
 */

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {  NetworkIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopicCanvasConsumer } from "./TopicCanvasContext";

export interface RootNodeData extends Record<string, unknown> {
  hasChildren: boolean;
}

export type RootNode = Node<RootNodeData, "root">;

export const RootNodeComponent = memo(function RootNodeComponent({
  data,
}: NodeProps<RootNode>) {
  const { hasChildren } = data;
  const { selectedTopic, setSelectedTopic, pendingAddParentId, startAddingTopic } = TopicCanvasConsumer();

  const isSelected = selectedTopic === "__root__";

  const handleSelect = () => {
    setSelectedTopic("__root__");
  };

  return (
    <div
      onClick={handleSelect}
      className="relative cursor-pointer flex flex-col items-center"
    >
      {/* Circular node */}
      <div
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center transition-all",
          "bg-[#111113] border-[1px]",
          isSelected
            ? "border-[rgb(var(--theme-500))]"
            : "border-emerald-500/30 hover:border-emerald-500/70"
        )}
        style={{
          boxShadow: isSelected
            ? '0 0 15px rgba(16, 185, 129, 0.3), 0 0 30px rgba(16, 185, 129, 0.15)'
            : undefined,
        }}
      >
        {/* Icon */}
        <NetworkIcon className="w-4 h-4 text-[rgb(var(--theme-500))]" />
      </div>

      {/* Label below circle */}
      <span className="mt-2 text-sm font-medium text-[rgb(var(--theme-500))]">
        Root
      </span>

      {/* Output handle - Right side of circle */}
      {(hasChildren || pendingAddParentId === null) && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-1.5 !h-1.5 !bg-emerald-500/50 !border-0 !min-w-0 !min-h-0 !top-8"
        />
      )}

      {/* Floating + button for adding child topic */}
      {isSelected && pendingAddParentId === undefined && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            startAddingTopic(null);
          }}
          className="absolute -right-3 top-8 -translate-y-1/2 translate-x-full w-6 h-6 rounded-md border border-border bg-background text-muted-foreground flex items-center justify-center hover:border-[rgb(var(--theme-500))] hover:text-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-500))]/10 transition-colors nodrag nopan"
          title="Add child topic"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
});
