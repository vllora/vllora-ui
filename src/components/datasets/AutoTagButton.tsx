/**
 * AutoTagButton
 *
 * Reusable button for auto-tagging records using the topic hierarchy.
 * Used in both AssignTopicDialog and TopicHierarchyDialog.
 */

import { Button } from "@/components/ui/button";
import { Wand2, Loader2 } from "lucide-react";

export interface AutoTagProgress {
  completed: number;
  total: number;
}

interface AutoTagButtonProps {
  /** Called when button is clicked */
  onAutoTag: () => Promise<void>;
  /** Whether auto-tagging is in progress */
  isAutoTagging: boolean;
  /** Progress of auto-tagging (completed/total) */
  progress?: AutoTagProgress | null;
  /** Whether the button is disabled (e.g., no hierarchy or no records) */
  disabled?: boolean;
  /** Button variant */
  variant?: "default" | "outline" | "ghost";
  /** Additional class names */
  className?: string;
  /** Label for the button (defaults to "Auto-tag Records") */
  label?: string;
}

export function AutoTagButton({
  onAutoTag,
  isAutoTagging,
  progress,
  disabled = false,
  variant = "outline",
  className = "",
  label = "Auto-tag Records",
}: AutoTagButtonProps) {
  // Calculate progress percentage
  const percentage = progress && progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  return (
    <Button
      variant={variant}
      className={`gap-2 ${className}`}
      onClick={onAutoTag}
      disabled={disabled || isAutoTagging}
    >
      {isAutoTagging ? (
        progress ? (
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden relative">
              <div
                className="h-full bg-[rgb(var(--theme-500))] transition-all duration-300 ease-out"
                style={{ width: `${percentage}%` }}
              />
              {/* Sliding highlight animation */}
              <div className="absolute inset-y-0 w-4 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-progress-slide" />
            </div>
            <span className="text-xs tabular-nums min-w-[3ch]">{percentage}%</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>Auto-tagging...</span>
          </div>
        )
      ) : (
        <>
          <Wand2 className="w-4 h-4" />
          {label}
        </>
      )}
    </Button>
  );
}
