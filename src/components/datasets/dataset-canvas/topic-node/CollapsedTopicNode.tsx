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

// Fixed width for collapsed state; compact when panel is open
export const COLLAPSED_WIDTH = 300;
export const COLLAPSED_WIDTH_COMPACT = 260;

export function CollapsedTopicNode({
  name,
  recordCount,
  aggregatedRecordCount,
  isRoot,
  isSelected,
  coveragePercentage,
  onRename,
}: CollapsedTopicNodeProps) {
  const { generatingTopicName, viewingTopicId, isFullDialogMode, getMatchingCount, isFilterActive } = TopicCanvasConsumer();

  // Shrink nodes when panel is open to give more canvas space
  const isPanelOpen = viewingTopicId !== null && !isFullDialogMode;

  // P0-15: Check if this topic is currently generating
  const isGenerating = generatingTopicName === name;

  // 7.4: Filtered count when stat filter is active
  const matchingCount = isFilterActive ? getMatchingCount(name) : null;

  return (
    <div
      className={cn(
        "rounded-xl border-[0.5px] transition-all bg-card",
        isSelected
          ? "border-[rgb(var(--theme-500))]"
          : "border-border hover:border-muted-foreground/50",
        // P0-15: pulsing border when generating
        isGenerating && "animate-pulse border-[rgba(var(--theme-500),0.6)]"
      )}
      style={{
        width: isPanelOpen ? COLLAPSED_WIDTH_COMPACT : COLLAPSED_WIDTH,
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
        filteredCount={matchingCount}
      />
    </div>
  );
}
