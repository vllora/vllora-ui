/**
 * CollapsedTopicNode
 *
 * Collapsed state display for a topic node.
 * Shows: header (name + count), quality score row, description line.
 *
 * - Quality row: colored dot + avg score + evaluated count
 * - Description: topic description or simplified prompt segment
 * - Parent nodes show child count indicator
 * - P0-15: Shows pulsing border when data is being generated for this topic
 */

import { cn } from "@/lib/utils";
import { TopicNodeHeader } from "../TopicNodeHeader";
import { TopicCanvasConsumer } from "../TopicCanvasContext";
import { formatTopicName } from "../TopicNodeHeader";
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
  /** Whether this node has child topics */
  hasChildren?: boolean;
  /** Topic description from hierarchy node */
  description?: string;
}

// Fixed width for collapsed state; compact when panel is open
export const COLLAPSED_WIDTH = 300;
export const COLLAPSED_WIDTH_COMPACT = 260;

/** Get color class for quality score */
function getScoreColor(avg: number): string {
  if (avg >= 0.8) return "text-emerald-500";
  if (avg >= 0.6) return "text-amber-500";
  return "text-red-500";
}

/** Get dot fill color for quality score */
function getScoreDotColor(avg: number): string {
  if (avg >= 0.8) return "bg-emerald-500";
  if (avg >= 0.6) return "bg-amber-500";
  return "bg-red-500";
}

export function CollapsedTopicNode({
  name,
  recordCount,
  aggregatedRecordCount,
  isRoot,
  isSelected,
  coveragePercentage,
  onRename,
  fullPath,
  hasChildren = false,
  description,
}: CollapsedTopicNodeProps) {
  const {
    generatingTopicName,
    viewingTopicId,
    isFullDialogMode,
    getMatchingCount,
    isFilterActive,
    topicQualityScores,
  } = TopicCanvasConsumer();

  // Shrink nodes when panel is open to give more canvas space
  const isPanelOpen = viewingTopicId !== null && !isFullDialogMode;

  // P0-15: Check if this topic is currently generating
  const isGenerating = generatingTopicName === name;

  // 7.4: Filtered count when stat filter is active
  const matchingCount = isFilterActive ? getMatchingCount(name) : null;

  // Quality scores for this topic
  const quality = topicQualityScores?.[name];
  const hasQuality = quality && quality.evaluated > 0;

  // Build description line: use topic description if available, else formatted name context
  const descriptionText = description
    || (fullPath && fullPath.includes("/")
      ? `Part of ${formatTopicName(fullPath.split("/").slice(0, -1).join(" / "))}`
      : undefined);

  // Count children from fullPath for parent indicator
  // (We pass hasChildren directly for accuracy)

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

      {/* Quality score row — colored dot + average + evaluated count */}
      {!isRoot && (
        <div className="px-3 -mt-0.5 flex items-center gap-1.5">
          {hasQuality ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-help">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", getScoreDotColor(quality.avg))} />
                    <span className={cn("text-[11px] font-medium tabular-nums", getScoreColor(quality.avg))}>
                      {quality.avg.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">
                      avg · {quality.evaluated} evaluated
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <div className="text-xs space-y-0.5">
                    <p>Average quality score: {quality.avg.toFixed(3)}</p>
                    <p>{quality.evaluated} of {quality.count} records evaluated</p>
                    {quality.evaluated < quality.count && (
                      <p className="text-muted-foreground">{quality.count - quality.evaluated} not yet evaluated</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="text-[10px] text-muted-foreground/40 italic">Not evaluated</span>
          )}
        </div>
      )}

      {/* Description line — topic description or parent path context */}
      {!isRoot && (
        <div className="px-3 pb-2 mt-0.5 flex items-center gap-1.5">
          {descriptionText ? (
            <p className="text-[10px] text-muted-foreground/60 truncate leading-tight">
              {descriptionText}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground/30 italic truncate leading-tight">
              No description
            </p>
          )}
          {/* Parent indicator — shows child count */}
          {hasChildren && aggregatedRecordCount !== undefined && (
            <span className="text-[9px] text-muted-foreground/50 bg-muted/50 px-1.5 py-0.5 rounded shrink-0">
              parent
            </span>
          )}
        </div>
      )}
    </div>
  );
}
