/**
 * TopicNodeHeader
 *
 * Renders a collapsible header row for a topic tree node.
 * Shows breadcrumb path, record count, and coverage indicator.
 */

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoverageIndicator } from "../dataset-canvas/CoverageIndicator";
import { BreadcrumbPath } from "./BreadcrumbPath";

export interface TopicNodeHeaderProps {
  /** Breadcrumb path segments */
  path: string[];
  /** Whether this node has expandable content */
  hasContent: boolean;
  /** Whether the node is currently expanded */
  isExpanded: boolean;
  /** Toggle expand/collapse */
  onToggle: () => void;
  /** Total record count for this node and descendants */
  totalCount: number;
  /** Coverage percentage (0-100) */
  percentage: number;
  /** Whether this node has children (used to hide stats when expanded) */
  hasChildren: boolean;
  /** Accent color variant */
  variant?: "default" | "unassigned";
}

export function TopicNodeHeader({
  path,
  hasContent,
  isExpanded,
  onToggle,
  totalCount,
  percentage,
  hasChildren,
  variant = "default",
}: TopicNodeHeaderProps) {
  const isUnassigned = variant === "unassigned";

  return (
    <button
      className={cn(
        "w-full flex items-center gap-2 py-2 px-3 text-left transition-colors",
        "bg-zinc-900/60 hover:bg-zinc-800/60 border-l-2",
        isUnassigned ? "border-l-amber-500/40" : "border-l-emerald-500/40",
        hasContent ? "cursor-pointer" : "cursor-default opacity-50"
      )}
      onClick={() => hasContent && onToggle()}
      disabled={!hasContent}
    >
      {/* Expand/collapse chevron */}
      <span className="w-6 h-6 flex items-center justify-center shrink-0">
        {hasContent ? (
          <ChevronRight
            className={cn(
              "w-4 h-4 transition-transform duration-200",
              isUnassigned ? "text-amber-500/70" : "text-emerald-500/70",
              isExpanded && "rotate-90"
            )}
          />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
        )}
      </span>

      {/* Content: breadcrumb or simple label */}
      {isUnassigned ? (
        <span className="text-xs font-medium text-amber-400 flex-1">
          Unassigned
        </span>
      ) : (
        <BreadcrumbPath path={path} />
      )}

      {/* Record count and coverage indicator - hide when expanded with children */}
      <div className="flex items-center justify-end gap-2 shrink-0">
        {(!isExpanded || !hasChildren) && (
          <>
            <span className={cn(
              "text-xs tabular-nums px-1.5 py-0.5 rounded",
              totalCount > 0 ? "bg-zinc-700/50 text-zinc-300" : "bg-zinc-800 text-zinc-600"
            )}>
              {totalCount}
            </span>
            {totalCount > 0 && (
              <CoverageIndicator
                coveragePercentage={percentage}
                recordCount={totalCount}
              />
            )}
          </>
        )}
      </div>
    </button>
  );
}
