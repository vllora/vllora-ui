/**
 * EvaluationEmptyState
 *
 * Placeholder card shown when evaluation is not configured.
 * Provides a visually appealing call-to-action to set up grading.
 */

import { FlaskConical, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CardHeader } from "../CardHeader";

interface EvaluationEmptyStateProps {
  /** Callback when clicking to configure evaluation */
  onConfigureClick?: () => void;
  /** Variant style */
  variant?: "default" | "compact";
}

export function EvaluationEmptyState({
  onConfigureClick,
  variant = "default",
}: EvaluationEmptyStateProps) {
  if (variant === "compact") {
    return (
      <button
        onClick={onConfigureClick}
        className={cn(
          "group w-full px-4 py-3 rounded-lg min-h-[88px]",
          "bg-gradient-to-br from-zinc-900/80 to-zinc-900/40",
          "border border-zinc-800/60 border-dashed",
          "flex items-center justify-center",
          "hover:border-zinc-700 hover:from-zinc-800/80 hover:to-zinc-900/60",
          "transition-all duration-200 cursor-pointer"
        )}
      >
        <div className="flex flex-col items-center gap-1.5 text-center">
          <FlaskConical className="w-5 h-5 text-zinc-500 group-hover:text-zinc-400 transition-colors" />
          <span className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">
            Configure evaluation
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onConfigureClick}
      className={cn(
        "group relative w-full px-4 py-3 rounded-lg min-h-[88px] overflow-hidden",
        "bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-800/50",
        "border border-zinc-800/80 border-dashed",
        "hover:border-emerald-600/40 hover:from-zinc-900/95 hover:via-zinc-800/80 hover:to-emerald-950/20",
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
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <CardHeader label="Evaluator" />

      {/* Content */}
      <div className="relative flex items-center gap-4">
        {/* Icon container */}
        <div
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-lg",
            "bg-zinc-800/50 border border-zinc-700/50",
            "group-hover:bg-emerald-950/30 group-hover:border-emerald-700/30",
            "transition-all duration-300"
          )}
        >
          <FlaskConical
            className={cn(
              "w-5 h-5 text-zinc-500",
              "group-hover:text-emerald-400",
              "transition-colors duration-300"
            )}
          />
        </div>

        {/* Text content */}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm font-medium text-zinc-300 group-hover:text-zinc-200 transition-colors">
              Set up evaluation
            </span>
            <Sparkles className="w-3 h-3 text-amber-500/70 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">
            Configure an evaluator to validate your dataset
          </p>
        </div>

        {/* Arrow indicator */}
        <ArrowRight
          className={cn(
            "w-4 h-4 text-zinc-600",
            "opacity-0 -translate-x-2",
            "group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-emerald-400",
            "transition-all duration-300"
          )}
        />
      </div>
    </button>
  );
}

/**
 * Empty state for when grader is configured but no dry run has been performed
 */
export function DryRunEmptyState({
  onDryRunClick,
}: {
  onDryRunClick?: () => void;
}) {
  return (
    <button
      onClick={onDryRunClick}
      className={cn(
        "group relative w-full px-4 py-3 rounded-lg min-h-[88px] overflow-hidden",
        "bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-800/50",
        "border border-zinc-800/80 border-dashed",
        "hover:border-blue-600/40 hover:from-zinc-900/95 hover:via-zinc-800/80 hover:to-blue-950/20",
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
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <CardHeader label="Evaluation" />

      {/* Content */}
      <div className="relative flex items-center gap-4">
        {/* Icon container */}
        <div
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-lg",
            "bg-zinc-800/50 border border-zinc-700/50",
            "group-hover:bg-blue-950/30 group-hover:border-blue-700/30",
            "transition-all duration-300"
          )}
        >
          <FlaskConical
            className={cn(
              "w-5 h-5 text-zinc-500",
              "group-hover:text-blue-400",
              "transition-colors duration-300"
            )}
          />
        </div>

        {/* Text content */}
        <div className="flex-1 text-left">
          <span className="text-sm font-medium text-zinc-300 group-hover:text-zinc-200 transition-colors">
            Run evaluation
          </span>
          <p className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">
            Test your evaluator on sample data
          </p>
        </div>

        {/* Arrow indicator */}
        <ArrowRight
          className={cn(
            "w-4 h-4 text-zinc-600",
            "opacity-0 -translate-x-2",
            "group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-blue-400",
            "transition-all duration-300"
          )}
        />
      </div>
    </button>
  );
}
