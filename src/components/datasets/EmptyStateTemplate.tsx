/**
 * EmptyStateTemplate
 *
 * Shared empty state layout for dataset sections.
 * Provides consistent structure: icon, heading, description, optional CTA, optional helper text.
 * Based on the PlanEmptyState pattern (the "gold standard").
 */

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateTemplateProps {
  /** Lucide icon component to display */
  icon: LucideIcon;
  /** Main heading text */
  heading: string;
  /** Description text (supports React nodes for links/formatting) */
  description: React.ReactNode;
  /** Optional action button(s) — rendered below the description */
  action?: React.ReactNode;
  /** Optional helper text below the action */
  helperText?: string;
  className?: string;
}

export function EmptyStateTemplate({
  icon: Icon,
  heading,
  description,
  action,
  helperText,
  className,
}: EmptyStateTemplateProps) {
  return (
    <div className={cn("flex-1 flex flex-col items-center justify-center p-8", className)}>
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        {/* Icon with themed gradient background */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[rgba(var(--theme-500),0.15)] to-[rgba(var(--theme-500),0.05)] flex items-center justify-center">
          <Icon className="w-6 h-6 text-[rgb(var(--theme-500))]" />
        </div>

        {/* Copy */}
        <div className="space-y-2">
          <h3 className="text-lg font-medium text-foreground">
            {heading}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>

        {/* Action */}
        {action}

        {/* Helper text */}
        {helperText && (
          <p className="text-xs text-muted-foreground">
            {helperText}
          </p>
        )}
      </div>
    </div>
  );
}
