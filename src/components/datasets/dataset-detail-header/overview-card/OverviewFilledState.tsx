/**
 * OverviewFilledState
 *
 * Shows records stats (donut) and topic distribution (bar) when data exists.
 */

import { OverviewChart } from "./OverviewChart";

type BalanceRating = "excellent" | "good" | "fair" | "poor" | "critical";

export interface OverviewFilledStateProps {
  total: number;
  original: number;
  generated: number;
  topicDistribution: Record<string, number>;
  uncategorizedCount: number;
  balanceRating?: BalanceRating;
  balanceScore?: number;
  onClick?: () => void;
}

export function OverviewFilledState({
  total,
  original,
  generated,
  topicDistribution,
  uncategorizedCount,
  balanceRating,
  balanceScore,
  onClick,
}: OverviewFilledStateProps) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors cursor-pointer text-left"
    >
      <OverviewChart
        total={total}
        original={original}
        generated={generated}
        topicDistribution={topicDistribution}
        uncategorizedCount={uncategorizedCount}
        balanceRating={balanceRating}
        balanceScore={balanceScore}
        size="sm"
        maxLegendItems={3}
      />
    </button>
  );
}
