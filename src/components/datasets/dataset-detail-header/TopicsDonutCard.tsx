/**
 * TopicsDonutCard
 *
 * Summary card showing topic coverage and balance at a glance:
 * - Donut: Categorized vs Uncategorized records
 * - Center: Number of leaf topics
 * - Legend: Categorized/Uncategorized counts + Balance rating
 *
 * Detailed per-topic distribution is shown in the canvas below.
 */

type BalanceRating = "excellent" | "good" | "fair" | "poor" | "critical";

export interface TopicsDonutCardProps {
  /** Number of leaf topics */
  leafTopicCount: number;
  /** Number of records with a topic assigned */
  categorizedCount: number;
  /** Number of records without a topic */
  uncategorizedCount: number;
  /** Balance rating */
  balanceRating?: BalanceRating;
  /** Balance score (0-1) */
  balanceScore?: number;
}

const BALANCE_COLORS: Record<BalanceRating, string> = {
  excellent: "text-emerald-500",
  good: "text-emerald-500",
  fair: "text-amber-500",
  poor: "text-red-500",
  critical: "text-red-500",
};

export function TopicsDonutCard({
  leafTopicCount,
  categorizedCount,
  uncategorizedCount,
  balanceRating,
  balanceScore,
}: TopicsDonutCardProps) {
  const total = categorizedCount + uncategorizedCount;
  const categorizedPercent = total > 0 ? (categorizedCount / total) * 100 : 0;
  const uncategorizedPercent = total > 0 ? (uncategorizedCount / total) * 100 : 0;

  // CSS conic-gradient for donut chart
  // Categorized = blue, Uncategorized = gray
  const gradientStyle = total > 0
    ? {
        background: `conic-gradient(
          rgb(59 130 246) 0% ${categorizedPercent}%,
          rgb(156 163 175) ${categorizedPercent}% 100%
        )`,
      }
    : { background: "rgb(156 163 175)" };

  // Center text: show leaf topic count
  const centerText = leafTopicCount > 0 ? leafTopicCount : "—";

  // Balance display
  const balanceColorClass = balanceRating ? BALANCE_COLORS[balanceRating] : "text-muted-foreground";

  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-lg bg-muted/50">
      {/* Donut Chart */}
      <div className="relative shrink-0">
        <div
          className="w-14 h-14 rounded-full"
          style={gradientStyle}
        />
        {/* Inner circle (creates donut hole) */}
        <div className="absolute inset-2 rounded-full bg-muted/50 flex items-center justify-center">
          <span className="text-xs font-semibold">{centerText}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground mb-1">Topics</div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            <span className="text-muted-foreground">Categorized</span>
            <span className="font-medium ml-auto">{categorizedCount.toLocaleString()}</span>
            <span className="text-muted-foreground w-10 text-right">{Math.round(categorizedPercent)}%</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
            <span className="text-muted-foreground">Uncategorized</span>
            <span className="font-medium ml-auto">{uncategorizedCount.toLocaleString()}</span>
            <span className="text-muted-foreground w-10 text-right">{Math.round(uncategorizedPercent)}%</span>
          </div>
          {/* Balance row */}
          <div className="flex items-center gap-2 text-xs pt-0.5">
            <span className="text-muted-foreground">Balance</span>
            <span className={`font-medium ml-auto capitalize ${balanceColorClass}`}>
              {balanceRating ?? "—"}
            </span>
            <span className="text-muted-foreground w-10 text-right">
              {balanceScore !== undefined ? `${Math.round(balanceScore * 100)}%` : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
