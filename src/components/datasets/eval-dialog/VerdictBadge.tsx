/**
 * VerdictBadge
 *
 * Badge displaying the dry run verdict (GO, WARNING, NO-GO).
 * Uses subtle muted styling — informative without demanding attention.
 */

import { cn } from "@/lib/utils";

interface VerdictBadgeProps {
  verdict: string;
}

export function VerdictBadge({ verdict }: VerdictBadgeProps) {
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded text-[10px] font-semibold border",
        verdict === "GO"
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          : verdict === "NO-GO"
          ? "bg-red-500/10 text-red-400 border-red-500/20"
          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
      )}
    >
      {verdict}
    </span>
  );
}
