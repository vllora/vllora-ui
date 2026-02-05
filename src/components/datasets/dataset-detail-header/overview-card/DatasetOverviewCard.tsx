/**
 * DatasetOverviewCard
 *
 * Combined card showing records stats (donut) and topic distribution (bar).
 * Shows empty state when no records, filled state when data exists.
 */

import { OverviewEmptyState } from "./OverviewEmptyState";
import { OverviewFilledState } from "./OverviewFilledState";

type BalanceRating = "excellent" | "good" | "fair" | "poor" | "critical";

export interface DatasetOverviewCardProps {
  // Records stats
  total: number;
  original: number;
  generated: number;
  // Topics stats
  topicDistribution: Record<string, number>;
  uncategorizedCount: number;
  balanceRating?: BalanceRating;
  balanceScore?: number;
  // Click handler for filled state (show analytics)
  onClick?: () => void;
  // Handler for empty state (import records)
  onImportClick?: () => void;
}

export function DatasetOverviewCard({
  total,
  original,
  generated,
  topicDistribution,
  uncategorizedCount,
  balanceRating,
  balanceScore,
  onClick,
  onImportClick,
}: DatasetOverviewCardProps) {
  // Show empty state when no records
  if (total === 0) {
    return <OverviewEmptyState onClick={onImportClick || onClick} />;
  }

  return (
    <OverviewFilledState
      total={total}
      original={original}
      generated={generated}
      topicDistribution={topicDistribution}
      uncategorizedCount={uncategorizedCount}
      balanceRating={balanceRating}
      balanceScore={balanceScore}
      onClick={onClick}
    />
  );
}
