/**
 * DonutChart
 *
 * Shared SVG donut chart showing original vs generated record proportions.
 * Used by both OverviewFilledState (card) and OverviewChart (analytics dialog).
 */

import { cn } from "@/lib/utils";

interface DonutChartProps {
  total: number;
  original: number;
  generated: number;
  /** CSS class for the outer container (controls rendered size) */
  className?: string;
  /** Whether to show center label with total count */
  showCenterLabel?: boolean;
  /** CSS class for the center label text */
  centerLabelClassName?: string;
}

export function DonutChart({
  total,
  original,
  generated,
  className = "w-16 h-16",
  showCenterLabel = true,
  centerLabelClassName = "text-lg font-bold text-zinc-100",
}: DonutChartProps) {
  const originalPercent = total > 0 ? (original / total) * 100 : 0;
  const generatedPercent = total > 0 ? (generated / total) * 100 : 0;

  return (
    <div className={cn("relative", className)}>
      <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
        {/* Background circle */}
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          stroke="#3f3f46"
          strokeWidth="5"
        />
        {/* Original segment (gray) */}
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          stroke="#9ca3af"
          strokeWidth="5"
          strokeDasharray={`${originalPercent} ${100 - originalPercent}`}
          strokeLinecap="round"
        />
        {/* Generated segment (violet) - offset by original */}
        {generated > 0 && (
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="#8b5cf6"
            strokeWidth="5"
            strokeDasharray={`${generatedPercent} ${100 - generatedPercent}`}
            strokeDashoffset={`-${originalPercent}`}
            strokeLinecap="round"
          />
        )}
      </svg>
      {/* Center label */}
      {showCenterLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={centerLabelClassName}>{total}</span>
        </div>
      )}
    </div>
  );
}
