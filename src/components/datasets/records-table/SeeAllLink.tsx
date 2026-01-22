/**
 * SeeAllLink
 *
 * A link component shown when records are truncated, allowing users to see all records.
 */

import { ArrowRight } from "lucide-react";

export interface SeeAllLinkProps {
  onClick: () => void;
}

export function SeeAllLink({ onClick }: SeeAllLinkProps) {
  return (
    <div className="px-4 py-3 flex justify-end border-t border-border/50">
      <button
        className="text-sm text-[rgb(var(--theme-500))] hover:text-[rgb(var(--theme-400))] hover:underline flex items-center gap-1 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        See all
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
