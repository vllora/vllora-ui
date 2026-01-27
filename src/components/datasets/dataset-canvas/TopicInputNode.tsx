/**
 * TopicInputNode
 *
 * Temporary node for inline topic creation.
 * Shows an input field where user can type a new topic name.
 * Has Cancel and Create buttons for explicit actions.
 */

import { memo, useRef, useEffect, useState, type KeyboardEvent } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TopicCanvasConsumer } from "./TopicCanvasContext";

export interface TopicInputNodeData extends Record<string, unknown> {
  parentTopicName: string | null;
}

export type TopicInputNode = Node<TopicInputNodeData, "topicInput">;

const NODE_WIDTH = 280;

export const TopicInputNodeComponent = memo(function TopicInputNodeComponent({
  data,
}: NodeProps<TopicInputNode>) {
  const { parentTopicName: _parentTopicName } = data;
  const { confirmAddingTopic, cancelAddingTopic } = TopicCanvasConsumer();

  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input when mounted
  useEffect(() => {
    // Small delay to ensure React Flow has positioned the node
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.trim()) {
      e.preventDefault();
      confirmAddingTopic(value.trim());
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelAddingTopic();
    }
  };

  const handleCreate = () => {
    if (value.trim()) {
      confirmAddingTopic(value.trim());
    }
  };

  const handleCancel = () => {
    cancelAddingTopic();
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "relative rounded-xl border border-dashed border-[rgb(var(--theme-500))] bg-[#111113] transition-all",
      )}
      style={{
        width: NODE_WIDTH,
        boxShadow: '0 0 15px rgba(16, 185, 129, 0.2), 0 0 30px rgba(16, 185, 129, 0.1)',
      }}
    >
      {/* Input handle - Left side for horizontal layout */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-[rgb(var(--theme-500))] !border-1 !border-background"
      />

      {/* Content */}
      <div className="px-4 py-4">
        {/* Icon and input row */}
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-[rgb(var(--theme-500))]/15 text-[rgb(var(--theme-500))]">
            <Pencil className="w-4 h-4" />
          </div>

          {/* Input field with underline */}
          <div className="flex-1 min-w-0 pt-1">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Name your topic..."
              className="w-full bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground pb-2 nodrag"
            />
            <div className="h-px bg-[rgb(var(--theme-500))]/50" />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground nodrag"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={!value.trim()}
            className="h-7 px-3 text-xs bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white nodrag"
          >
            Create
          </Button>
        </div>
      </div>
    </div>
  );
});
