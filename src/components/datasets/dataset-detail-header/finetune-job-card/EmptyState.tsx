/**
 * EmptyState
 *
 * Shown when no finetune jobs exist yet. Provides CTA to start training.
 */

import { Play, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CardHeader } from "../CardHeader";

interface EmptyStateProps {
  onStartClick?: () => void;
  canStartJob: boolean;
}

export function EmptyState({ onStartClick, canStartJob }: EmptyStateProps) {
  return (
    <button
      onClick={onStartClick}
      disabled={!canStartJob}
      className={cn(
        "group relative w-full px-4 py-3 rounded-lg min-h-[88px] overflow-hidden",
        "bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-800/50",
        "border border-zinc-800/80 border-dashed",
        canStartJob && "hover:border-violet-600/40 hover:from-zinc-900/95 hover:via-zinc-800/80 hover:to-violet-950/20",
        "transition-all duration-300",
        canStartJob ? "cursor-pointer" : "cursor-not-allowed opacity-60"
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
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <CardHeader label="Training" />

      {/* Content */}
      <div className="relative flex items-center gap-4">
        {/* Icon container */}
        <div
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-lg",
            "bg-zinc-800/50 border border-zinc-700/50",
            canStartJob && "group-hover:bg-violet-950/30 group-hover:border-violet-700/30",
            "transition-all duration-300"
          )}
        >
          <Play
            className={cn(
              "w-5 h-5 text-zinc-500",
              canStartJob && "group-hover:text-violet-400",
              "transition-colors duration-300"
            )}
          />
        </div>

        {/* Text content */}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={cn(
              "text-sm font-medium text-zinc-300",
              canStartJob && "group-hover:text-zinc-200",
              "transition-colors"
            )}>
              Start fine-tuning
            </span>
            {canStartJob && (
              <Sparkles className="w-3 h-3 text-amber-500/70 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          <p className={cn(
            "text-xs text-zinc-500",
            canStartJob && "group-hover:text-zinc-400",
            "transition-colors"
          )}>
            {canStartJob
              ? "Train a custom model on your dataset"
              : "Add records to start training"
            }
          </p>
        </div>

        {/* Arrow indicator */}
        {canStartJob && (
          <ArrowRight
            className={cn(
              "w-4 h-4 text-zinc-600",
              "opacity-0 -translate-x-2",
              "group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-violet-400",
              "transition-all duration-300"
            )}
          />
        )}
      </div>
    </button>
  );
}
