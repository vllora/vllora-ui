/**
 * CollapsedTopicNode
 *
 * Collapsed state display for a topic node.
 * Shows header with name and record count in a compact format.
 *
 * P0-15: Shows pulsing border when data is being generated for this topic
 */

import { cn } from "@/lib/utils";
import { TopicNodeHeader } from "../TopicNodeHeader";
import { TopicCanvasConsumer } from "../TopicCanvasContext";

interface CollapsedTopicNodeProps {
  name: string;
  /** Key for looking up records in context (node.id or node.name) */
  topicKey?: string;
  recordCount: number;
  /** For parent nodes: aggregated count of all descendants (used for coverage calculation) */
  aggregatedRecordCount?: number;
  isRoot: boolean;
  isSelected: boolean;
  /** Coverage percentage from coverageStats (0-100) */
  coveragePercentage?: number;
  onRename?: (newName: string) => void;
}

// Fixed width for collapsed state
export const COLLAPSED_WIDTH = 300;

export function CollapsedTopicNode({
  name,
  recordCount,
  aggregatedRecordCount,
  isRoot,
  isSelected,
  coveragePercentage,
  onRename,
}: CollapsedTopicNodeProps) {
  const { generatingTopicName } = TopicCanvasConsumer();

  // P0-15: Check if this topic is currently generating
  const isGenerating = generatingTopicName === name;

  return (
    <div
      className={cn(
        "rounded-xl border-[0.5px] transition-all bg-card",
        isSelected
          ? "border-[rgb(var(--theme-500))]"
          : "border-border hover:border-muted-foreground/50",
        // P0-15: pulsing border when generating
        isGenerating && "animate-pulse border-emerald-500/60"
      )}
      style={{
        width: COLLAPSED_WIDTH,
        boxShadow: isSelected
          ? '0 0 15px rgba(var(--theme-500), 0.15), 0 0 30px rgba(var(--theme-500), 0.08)'
          : undefined,
      }}
    >
      <TopicNodeHeader
        name={name}
        recordCount={recordCount}
        aggregatedRecordCount={aggregatedRecordCount}
        isRoot={isRoot}
        isExpanded={false}
        coveragePercentage={coveragePercentage}
        onRename={onRename}
      />
    </div>
  );
}
