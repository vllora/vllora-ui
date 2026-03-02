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
import {
  getTopicPromptSegmentParts,
  getRoleSentenceParts,
  buildAccumulatedPromptSegments,
  type PromptTextSegment,
} from "@/lib/distri-finetune-tools/steps/shared/topic-system-prompt";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  /** 0-based depth in hierarchy (for system prompt segment display) */
  depth?: number;
  /** Full hierarchical path (e.g., "culinary_fundamentals/knife_skills") for accumulated prompt tooltip */
  fullPath?: string;
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
  depth = 0,
  fullPath,
}: CollapsedTopicNodeProps) {
  const { generatingTopicName, viewingTopicId, isFullDialogMode, getMatchingCount, isFilterActive, datasetObjective } = TopicCanvasConsumer();

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
      {/* System prompt segment — color-coded: template in dim gray, topic name in accent */}
      {datasetObjective && (() => {
        const parts = isRoot
          ? getRoleSentenceParts(datasetObjective)
          : getTopicPromptSegmentParts(name, depth);
        // Build accumulated prompt segments for the tooltip (non-root only)
        const tooltipSegments: PromptTextSegment[] | null = !isRoot && fullPath
          ? buildAccumulatedPromptSegments(fullPath.split('/'), name, datasetObjective)
          : null;
        return (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="px-3 pb-2 -mt-1 text-[10px] font-mono truncate leading-tight cursor-help">
                  <span className="text-muted-foreground/40">{parts.template}</span>
                  <span className="text-[rgb(var(--theme-500))]">{parts.topicName}</span>
                  <span className="text-muted-foreground/40">{parts.suffix}</span>
                </p>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-md">
                {tooltipSegments ? (
                  <p className="text-xs font-mono whitespace-pre-wrap">
                    {tooltipSegments.map((seg, i) => (
                      <span key={i} className={cn(
                        seg.type === 'template' && 'text-muted-foreground',
                        seg.type === 'topicName' && 'text-[rgb(var(--theme-500))]',
                        seg.type === 'currentTopicName' && 'text-[rgb(var(--theme-500))] font-semibold underline underline-offset-2',
                      )}>
                        {seg.text}
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className="text-xs font-mono">
                    <span className="text-muted-foreground">{parts.template}</span>
                    <span className="text-[rgb(var(--theme-500))]">{parts.topicName}</span>
                    <span className="text-muted-foreground">{parts.suffix}</span>
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })()}
    </div>
  );
}
