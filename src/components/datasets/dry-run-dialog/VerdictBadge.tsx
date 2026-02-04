/**
 * VerdictBadge
 *
 * Badge displaying the dry run verdict (GO, WARNING, NO-GO).
 */

import { cn } from "@/lib/utils";

interface VerdictBadgeProps {
  verdict: string;
}

export function VerdictBadge({ verdict }: VerdictBadgeProps) {
  return (
    <span
      className={cn(
        "ml-2 px-2 py-0.5 rounded-full text-xs font-bold",
        verdict === "GO"
          ? "bg-green-600 text-white"
          : verdict === "NO-GO"
          ? "bg-red-600 text-white"
          : "bg-amber-600 text-white"
      )}
    >
      {verdict === "GO" ? "GO" : verdict === "NO-GO" ? "NO-GO" : "WARNING"}
    </span>
  );
}
