/**
 * EvaluationFailedState
 *
 * Card shown when the last dry run failed.
 * Provides a visually appealing call-to-action to retry.
 */

import { FlaskConical, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface EvaluationFailedStateProps {
  /** Callback when clicking to retry */
  onRetryClick?: () => void;
  /** Error message to display */
  errorMessage?: string;
}

export function EvaluationFailedState({
  onRetryClick,
  errorMessage,
}: EvaluationFailedStateProps) {
  return (
    <button
      onClick={onRetryClick}
      className={cn(
        "group relative w-full px-4 py-3 rounded-lg min-h-[88px] overflow-hidden",
        "bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-red-950/20",
        "border border-red-900/30",
        "hover:border-red-600/40 hover:from-zinc-900/95 hover:via-zinc-800/80 hover:to-red-950/30",
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
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-red-500/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Content */}
      <div className="relative flex items-center gap-4">
        {/* Icon container */}
        <div
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-lg",
            "bg-red-950/30 border border-red-900/30",
            "group-hover:bg-red-950/40 group-hover:border-red-700/40",
            "transition-all duration-300"
          )}
        >
          <FlaskConical
            className={cn(
              "w-5 h-5 text-red-400",
              "group-hover:text-red-300",
              "transition-colors duration-300"
            )}
          />
        </div>

        {/* Text content */}
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-red-400 group-hover:text-red-300 transition-colors">
              Last evaluation failed
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950/50 text-red-400/80 border border-red-900/30">
              Error
            </span>
          </div>
          <p className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors truncate mt-0.5">
            {errorMessage || "Click to view details and retry"}
          </p>
        </div>

        {/* Arrow indicator */}
        <ArrowRight
          className={cn(
            "w-4 h-4 text-zinc-600 flex-shrink-0",
            "opacity-0 -translate-x-2",
            "group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-red-400",
            "transition-all duration-300"
          )}
        />
      </div>
    </button>
  );
}
