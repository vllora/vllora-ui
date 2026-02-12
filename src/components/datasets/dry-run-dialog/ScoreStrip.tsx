/**
 * ScoreStrip
 *
 * Compact horizontal score distribution visualization.
 * Shows a mini bar chart where each segment's height reflects
 * the proportion of scores in that bin. Includes count labels
 * on populated bins and a mean marker with label.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface ScoreStripProps {
  scores: number[];
  mean?: number;
  className?: string;
}

const BIN_COLORS = [
  "#ef4444", // red-500    0.0-0.1
  "#f87171", // red-400    0.1-0.2
  "#f97316", // orange-500 0.2-0.3
  "#fb923c", // orange-400 0.3-0.4
  "#eab308", // yellow-500 0.4-0.5
  "#facc15", // yellow-400 0.5-0.6
  "#84cc16", // lime-500   0.6-0.7
  "#a3e635", // lime-400   0.7-0.8
  "#10b981", // emerald-500 0.8-0.9
  "#34d399", // emerald-400 0.9-1.0
];

export function ScoreStrip({ scores, mean, className }: ScoreStripProps) {
  const bins = useMemo(() => {
    const counts = Array(10).fill(0) as number[];
    scores.forEach((s) => {
      const idx = Math.min(Math.floor(s * 10), 9);
      counts[idx]++;
    });
    const max = Math.max(...counts, 1);
    return counts.map((count, i) => ({
      count,
      heightPct: count === 0 ? 0 : Math.max(15, (count / max) * 100),
      color: BIN_COLORS[i],
      label: `${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}`,
    }));
  }, [scores]);

  const meanPct = mean !== undefined ? mean * 100 : undefined;

  return (
    <div className={cn("space-y-0", className)}>
      {/* Mini bar chart */}
      <div className="relative flex items-end h-8 gap-px rounded-md overflow-hidden bg-zinc-800/30">
        {bins.map((bin, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
            <div
              className="w-full rounded-t-sm relative"
              style={{
                height: `${bin.heightPct}%`,
                backgroundColor: bin.color,
                opacity: bin.count === 0 ? 0.1 : 0.85,
              }}
            >
              {bin.count > 0 && (
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/90 drop-shadow-sm">
                  {bin.count}
                </span>
              )}
            </div>
          </div>
        ))}
        {/* Mean marker */}
        {meanPct !== undefined && (
          <div
            className="absolute top-0 bottom-0 w-px bg-white/70"
            style={{ left: `${meanPct}%` }}
          >
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[3px] border-r-[3px] border-t-[4px] border-l-transparent border-r-transparent border-t-white/80" />
          </div>
        )}
      </div>
      {/* Scale labels */}
      <div className="flex justify-between text-[9px] text-zinc-600 font-mono px-0.5 mt-0.5">
        <span>0.0</span>
        <span>0.5</span>
        <span>1.0</span>
      </div>
    </div>
  );
}
