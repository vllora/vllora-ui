/**
 * BreadcrumbPath
 *
 * Renders a breadcrumb-style path with chevron separators.
 */

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbPathProps {
  path: string[];
  className?: string;
}

export function BreadcrumbPath({ path, className }: BreadcrumbPathProps) {
  return (
    <div className={cn("flex items-center gap-1.5 flex-1 min-w-0", className)}>
      {path.map((segment, index) => {
        const isLast = index === path.length - 1;
        return (
          <span key={index} className="flex items-center gap-1.5 shrink-0">
            {index > 0 && (
              <ChevronRight className="w-3 h-3 text-muted-foreground/60" />
            )}
            <span
              className={cn(
                "text-xs",
                isLast
                  ? "font-medium text-[rgb(var(--theme-500))]"
                  : "text-muted-foreground"
              )}
            >
              {segment}
            </span>
          </span>
        );
      })}
    </div>
  );
}
