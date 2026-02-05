/**
 * OverviewEmptyState
 *
 * Empty state shown when no records exist in the dataset.
 * Provides a CTA to generate data.
 */

import { Database, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface OverviewEmptyStateProps {
  onClick?: () => void;
}

export function OverviewEmptyState({ onClick }: OverviewEmptyStateProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full px-4 py-3 rounded-lg min-h-[88px] overflow-hidden",
        "bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-800/50",
        "border border-zinc-800/80 border-dashed",
        "hover:border-cyan-600/40 hover:from-zinc-900/95 hover:via-zinc-800/80 hover:to-cyan-950/20",
        "transition-all duration-300 cursor-pointer"
      )}
    >
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: "16px 16px",
          }}
        />
      </div>

      {/* Glow effect on hover */}
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Content */}
      <div className="relative flex items-center gap-4">
        {/* Icon container */}
        <div
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-lg",
            "bg-zinc-800/50 border border-zinc-700/50",
            "group-hover:bg-cyan-950/30 group-hover:border-cyan-700/30",
            "transition-all duration-300"
          )}
        >
          <Database
            className={cn(
              "w-5 h-5 text-zinc-500",
              "group-hover:text-cyan-400",
              "transition-colors duration-300"
            )}
          />
        </div>

        {/* Text content */}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm font-medium text-zinc-300 group-hover:text-zinc-200 transition-colors">
              Add records
            </span>
            <Sparkles className="w-3 h-3 text-amber-500/70 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">
            Generate data to get started
          </p>
        </div>

        {/* Arrow indicator */}
        <ArrowRight
          className={cn(
            "w-4 h-4 text-zinc-600",
            "opacity-0 -translate-x-2",
            "group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-cyan-400",
            "transition-all duration-300"
          )}
        />
      </div>
    </button>
  );
}
