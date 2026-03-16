/**
 * CollapsedTopicNode
 *
 * Collapsed state display for a topic node.
 * Simplified to 3 signals only: header (name + count), coverage bar, source count.
 * P0-15: Shows pulsing border when data is being generated for this topic.
 */

import { FileText } from "lucide-react";
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
  /** 0-based depth in hierarchy (for system prompt segment display) */
  depth?: number;
  /** Full hierarchical path (e.g., "culinary_fundamentals/knife_skills") for accumulated prompt tooltip */
  fullPath?: string;
  /** Whether this node has child topics */
  hasChildren?: boolean;
  /** Topic description from hierarchy node */
  description?: string;
  /** Count of linked knowledge source parts */
  sourceRefCount?: number;
}

// Fixed width for collapsed state
export const COLLAPSED_WIDTH = 260;

export function CollapsedTopicNode({
  name,
  recordCount,
  aggregatedRecordCount,
  isRoot,
  isSelected,
  coveragePercentage,
  onRename,
  sourceRefCount = 0,
}: CollapsedTopicNodeProps) {
  const {
    generatingTopicName,
    getMatchingCount,
    isFilterActive,
    zoomedTopicId,
    topicQualityScores,
  } = TopicCanvasConsumer();

  const isGenerating = generatingTopicName === name;
  const isZoomed = zoomedTopicId === name;
  const matchingCount = isFilterActive ? getMatchingCount(name) : null;
  const quality = topicQualityScores?.[name];

  return (
    <div
      className={cn(
        "rounded-xl border-[0.5px] transition-all bg-card",
        isSelected
          ? "border-[rgb(var(--theme-500))]"
          : "border-border hover:border-muted-foreground/50",
        isGenerating && "animate-pulse border-[rgba(var(--theme-500),0.6)]",
        isZoomed && "ring-2 ring-[rgba(var(--theme-500),0.4)] ring-offset-2 ring-offset-background"
      )}
      style={{
        width: COLLAPSED_WIDTH,
        boxShadow: isZoomed
          ? '0 0 20px rgba(var(--theme-500), 0.25), 0 0 40px rgba(var(--theme-500), 0.12), 0 0 60px rgba(var(--theme-500), 0.06)'
          : isSelected
            ? '0 0 15px rgba(var(--theme-500), 0.15), 0 0 30px rgba(var(--theme-500), 0.08)'
            : undefined,
      }}
    >
      {/* Signal 1: Header — name + record count */}
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

      {/* Signal 2: Coverage bar — color-coded: emerald ≥80%, amber ≥60%, red <60% */}
      {!isRoot && coveragePercentage !== undefined && coveragePercentage > 0 && (
        <div className="px-3 -mt-0.5 flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                coveragePercentage >= 80 ? "bg-emerald-500" : coveragePercentage >= 60 ? "bg-amber-500" : "bg-red-500"
              )}
              style={{ width: `${Math.min(coveragePercentage, 100)}%` }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground/50 tabular-nums shrink-0">
            {coveragePercentage.toFixed(0)}%
          </span>
        </div>
      )}

      {/* Signal 3: Quality score + Source count footer */}
      {!isRoot && ((quality?.evaluated ?? 0) > 0 || sourceRefCount > 0) ? (
        <div className="px-3 pb-2 -mt-0.5 flex items-center gap-1.5">
          {quality && quality.evaluated > 0 && (
            <>
              <span className={cn(
                "w-2 h-2 rounded-full shrink-0",
                quality.avg >= 0.8 ? "bg-emerald-500" : quality.avg >= 0.6 ? "bg-amber-500" : "bg-red-500"
              )} />
              <span className={cn(
                "text-[10px] font-medium tabular-nums",
                quality.avg >= 0.8 ? "text-emerald-500/80" : quality.avg >= 0.6 ? "text-amber-500/80" : "text-red-500/80"
              )}>
                {quality.avg.toFixed(2)}
              </span>
            </>
          )}
          {sourceRefCount > 0 && (
            <>
              <FileText className="w-3 h-3 text-muted-foreground/50" />
              <span className={cn(
                "text-[10px] font-medium",
                sourceRefCount >= 3 ? "text-emerald-500/80" : "text-amber-500/80"
              )}>
                {sourceRefCount} source{sourceRefCount !== 1 ? "s" : ""}
              </span>
            </>
          )}
        </div>
      ) : (
        !isRoot && <div className="pb-1" />
      )}
    </div>
  );
}
