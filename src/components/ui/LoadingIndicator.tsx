/**
 * LoadingIndicator
 *
 * Shared loading/spinner component with three variants:
 * - `inline`   — small spinner next to text (for buttons, badges, table rows)
 * - `section`  — centered spinner with message (for content areas, pages)
 * - `progress` — indeterminate progress bar (for long operations like plan generation)
 */

import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type LoadingVariant = "inline" | "section" | "progress";

interface LoadingIndicatorProps {
  /** Visual variant */
  variant?: LoadingVariant;
  /** Optional message displayed next to or below the spinner */
  message?: string;
  /** Optional secondary message (smaller, muted) — only for `section` variant */
  submessage?: string;
  /** Override the default Loader2 icon — only for `section` variant */
  icon?: LucideIcon | React.ReactNode;
  /** Additional className */
  className?: string;
}

export function LoadingIndicator({
  variant = "inline",
  message,
  submessage,
  icon,
  className,
}: LoadingIndicatorProps) {
  if (variant === "inline") {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        {message && <span className="text-sm text-muted-foreground">{message}</span>}
      </span>
    );
  }

  if (variant === "progress") {
    return (
      <div className={cn("flex flex-col items-center gap-4", className)}>
        {message && (
          <div className="text-center space-y-1">
            <p className="text-base font-medium text-foreground">{message}</p>
            {submessage && (
              <p className="text-sm text-muted-foreground leading-relaxed">{submessage}</p>
            )}
          </div>
        )}
        <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-[rgb(var(--theme-500))] rounded-full animate-loading-progress" />
        </div>
      </div>
    );
  }

  // variant === "section"
  const renderIcon = () => {
    if (!icon) {
      return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
    }
    // Check if icon is a Lucide component (function) vs a React node
    if (typeof icon === "function") {
      const IconComponent = icon as LucideIcon;
      return <IconComponent className="w-5 h-5 animate-spin text-muted-foreground" />;
    }
    return icon;
  };

  return (
    <div className={cn("flex-1 flex items-center justify-center", className)}>
      <div className="flex flex-col items-center gap-3">
        {renderIcon()}
        {(message || submessage) && (
          <div className="text-center">
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
            {submessage && (
              <p className="text-xs text-muted-foreground/60 mt-1">{submessage}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
