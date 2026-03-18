/**
 * TopicEvalBreakdown
 *
 * Visual per-topic evaluation score breakdown.
 * Shows a sortable list with horizontal score bars, sample counts, and status badges.
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { TopicEvalStats, QualityRating } from "@/types/dataset-types";

interface TopicEvalBreakdownProps {
  readonly byTopic: Record<string, TopicEvalStats>;
}

type SortKey = "name" | "mean" | "count";

const STATUS_STYLES: Record<QualityRating, { label: string; className: string }> = {
  good: { label: "Good", className: "text-emerald-400 bg-emerald-500/10" },
  warning: { label: "Warning", className: "text-amber-400 bg-amber-500/10" },
  problem: { label: "Problem", className: "text-red-400 bg-red-500/10" },
  unknown: { label: "N/A", className: "text-muted-foreground bg-muted/30" },
};

export function TopicEvalBreakdown({ byTopic }: TopicEvalBreakdownProps) {
  const [sortKey, setSortKey] = useState<SortKey>("mean");
  const [sortDesc, setSortDesc] = useState(true);

  const entries = useMemo(() => {
    const items = Object.entries(byTopic).map(([name, stats]) => ({ name, ...stats }));
    return items.sort((a, b) => {
      const mul = sortDesc ? -1 : 1;
      if (sortKey === "name") return mul * a.name.localeCompare(b.name);
      if (sortKey === "mean") return mul * (a.mean - b.mean);
      return mul * (a.count - b.count);
    });
  }, [byTopic, sortKey, sortDesc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortDesc(key !== "name");
    }
  };

  if (entries.length === 0) return null;

  const maxMean = Math.max(...entries.map((e) => e.mean), 0.01);

  return (
    <div className="space-y-2">
      {/* Column headers */}
      <div className="flex items-center gap-2 px-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
        <SortButton label="Topic" sortKey="name" current={sortKey} desc={sortDesc} onClick={handleSort} className="flex-1" />
        <SortButton label="Score" sortKey="mean" current={sortKey} desc={sortDesc} onClick={handleSort} className="w-[180px]" />
        <SortButton label="N" sortKey="count" current={sortKey} desc={sortDesc} onClick={handleSort} className="w-10 text-right" />
        <span className="w-16 text-center">Status</span>
      </div>

      {/* Topic rows */}
      <div className="space-y-0.5">
        {entries.map((entry) => {
          const style = STATUS_STYLES[entry.status];
          const barPct = (entry.mean / maxMean) * 100;
          const barColor = entry.mean >= 0.8
            ? "bg-emerald-500/30" : entry.mean >= 0.6
            ? "bg-amber-500/30" : "bg-red-500/30";

          return (
            <div
              key={entry.name}
              className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-muted/20 transition-colors"
            >
              <span className="flex-1 text-xs text-foreground/80 truncate" title={entry.name}>
                {entry.name}
              </span>
              <div className="w-[180px] flex items-center gap-2">
                <div className="flex-1 h-4 bg-muted/20 rounded overflow-hidden">
                  <div
                    className={cn("h-full rounded", barColor)}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <span className="text-[11px] font-mono tabular-nums text-foreground/70 w-10 text-right">
                  {entry.mean.toFixed(3)}
                </span>
              </div>
              <span className="w-10 text-right text-[11px] text-muted-foreground tabular-nums">
                {entry.count}
              </span>
              <span className={cn("w-16 text-center text-[10px] font-medium px-1.5 py-0.5 rounded-full", style.className)}>
                {style.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SortButton({
  label,
  sortKey,
  current,
  desc,
  onClick,
  className,
}: {
  readonly label: string;
  readonly sortKey: SortKey;
  readonly current: SortKey;
  readonly desc: boolean;
  readonly onClick: (key: SortKey) => void;
  readonly className?: string;
}) {
  const isActive = current === sortKey;
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={cn("cursor-pointer hover:text-foreground/80 transition-colors text-left", className)}
    >
      {label}
      {isActive && <span className="ml-0.5">{desc ? "\u2193" : "\u2191"}</span>}
    </button>
  );
}
