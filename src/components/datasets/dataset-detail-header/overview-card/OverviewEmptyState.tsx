/**
 * OverviewEmptyState
 *
 * Empty state shown when no records exist in the dataset.
 * Provides a CTA to generate data.
 */

import { Database, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CardHeader } from "../CardHeader";

interface OverviewEmptyStateProps {
  onClick?: () => void;
  /** Number of leaf topics configured (0 = no topics) */
  topicCount?: number;
}

export function OverviewEmptyState({ onClick, topicCount = 0 }: OverviewEmptyStateProps) {
  const hasTopics = topicCount > 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full px-4 py-3 rounded-lg min-h-[88px] overflow-hidden",
        "bg-zinc-900/50 border border-zinc-800",
        "hover:border-[rgba(var(--theme-500),0.3)] hover:bg-zinc-800/50",
        "transition-all duration-300 cursor-pointer"
      )}
    >
      {/* Glow effect on hover */}
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-[rgb(var(--theme-500))]/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <CardHeader label="Dataset" />

      {/* Content */}
      <div className="relative flex items-center gap-4">
        {/* Icon container */}
        <div
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-lg",
            "bg-zinc-800/50 border border-zinc-700/50",
            "group-hover:bg-[rgb(var(--theme-500))]/10 group-hover:border-[rgb(var(--theme-500))]/30",
            "transition-all duration-300"
          )}
        >
          <Database
            className={cn(
              "w-5 h-5 text-zinc-500",
              "group-hover:text-[rgb(var(--theme-500))]",
              "transition-colors duration-300"
            )}
          />
        </div>

        {/* Text content */}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm font-medium text-zinc-300 group-hover:text-zinc-200 transition-colors">
              {hasTopics ? `${topicCount} topic${topicCount !== 1 ? "s" : ""} configured` : "Add records"}
            </span>
            <Sparkles className="w-3 h-3 text-amber-500/70 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">
            {hasTopics ? "Generate records to fill them" : "Generate data to get started"}
          </p>
        </div>

        {/* Arrow indicator */}
        <ArrowRight
          className={cn(
            "w-4 h-4 text-zinc-600",
            "opacity-0 -translate-x-2",
            "group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-[rgb(var(--theme-500))]",
            "transition-all duration-300"
          )}
        />
      </div>
    </button>
  );
}
