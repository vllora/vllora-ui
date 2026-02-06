/**
 * CardHeader
 *
 * Shared header component for dataset detail cards.
 * Displays a consistent label with optional right-side content.
 */

import { cn } from "@/lib/utils";

interface CardHeaderProps {
  /** The label text (e.g., "Dataset", "Evaluation", "Training") */
  label: string;
  /** Optional content to display on the right side */
  rightContent?: React.ReactNode;
  /** Additional class names */
  className?: string;
}

export function CardHeader({ label, rightContent, className }: CardHeaderProps) {
  return (
    <div className={cn("relative flex items-center justify-between mb-3", className)}>
      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      {rightContent}
    </div>
  );
}
