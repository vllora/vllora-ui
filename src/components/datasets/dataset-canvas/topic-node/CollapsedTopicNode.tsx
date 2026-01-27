/**
 * CollapsedTopicNode
 *
 * Collapsed state display for a topic node.
 * Shows header with name and record count in a compact format.
 */

import { cn } from "@/lib/utils";
import { TopicNodeHeader } from "../TopicNodeHeader";

interface CollapsedTopicNodeProps {
  name: string;
  recordCount: number;
  isRoot: boolean;
  isSelected: boolean;
  onToggleExpansion: () => void;
  onRename?: (newName: string) => void;
}

// Fixed width for collapsed state
export const COLLAPSED_WIDTH = 280;

export function CollapsedTopicNode({
  name,
  recordCount,
  isRoot,
  isSelected,
  onToggleExpansion,
  onRename,
}: CollapsedTopicNodeProps) {
  return (
    <div
      className={cn(
        "rounded-xl border-[0.5px] transition-all bg-[#111113]",
        isSelected
          ? "border-[rgb(var(--theme-500))]"
          : "border-emerald-500/40 hover:border-emerald-500/50"
      )}
      style={{
        width: COLLAPSED_WIDTH,
        boxShadow: isSelected
          ? '0 0 15px rgba(16, 185, 129, 0.2), 0 0 30px rgba(16, 185, 129, 0.1)'
          : undefined,
      }}
    >
      <TopicNodeHeader
        name={name}
        recordCount={recordCount}
        isRoot={isRoot}
        isExpanded={false}
        onToggleExpansion={onToggleExpansion}
        onRename={onRename}
      />
    </div>
  );
}
