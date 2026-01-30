/**
 * CoverageDistribution
 *
 * Displays topic distribution with horizontal bar chart and balance metrics.
 * Shows current vs target percentages and identifies gaps.
 */

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { AlertTriangle, TrendingUp, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopicData {
  name: string;
  count: number;
  percentage: number;
  target?: number;
  isUnderRepresented: boolean;
}

interface CoverageDistributionProps {
  /** Map of topic name to record count */
  topicCounts: Record<string, number>;
  /** Total number of records */
  totalRecords: number;
  /** Optional target percentages per topic */
  targetDistribution?: Record<string, number>;
  /** Compact mode for smaller display */
  compact?: boolean;
  /** Show as percentage instead of count */
  showPercentage?: boolean;
}

/**
 * Calculate balance score (0-1) based on how evenly distributed topics are.
 * Score of 1 = perfectly balanced, Score near 0 = very imbalanced
 */
function calculateBalanceScore(percentages: number[]): number {
  if (percentages.length === 0) return 0;
  if (percentages.length === 1) return 1;

  const min = Math.min(...percentages);
  const max = Math.max(...percentages);

  if (max === 0) return 0;

  // Ratio of min to max (1 = perfectly balanced)
  return min / max;
}

/**
 * Get balance status label and color
 */
function getBalanceStatus(score: number): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (score >= 0.7) {
    return {
      label: "Good",
      color: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-900/30",
    };
  } else if (score >= 0.4) {
    return {
      label: "Fair",
      color: "text-amber-600",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
    };
  } else {
    return {
      label: "Poor",
      color: "text-red-600",
      bgColor: "bg-red-100 dark:bg-red-900/30",
    };
  }
}

// Custom tooltip for the chart
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: TopicData }>;
}) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  return (
    <div className="bg-popover border rounded-md shadow-md p-2 text-sm">
      <p className="font-medium">{data.name}</p>
      <p className="text-muted-foreground">
        {data.count.toLocaleString()} records ({data.percentage.toFixed(1)}%)
      </p>
      {data.target && (
        <p className="text-muted-foreground">Target: {data.target}%</p>
      )}
      {data.isUnderRepresented && (
        <p className="text-amber-600 text-xs mt-1">⚠️ Under-represented</p>
      )}
    </div>
  );
}

export function CoverageDistribution({
  topicCounts,
  totalRecords,
  targetDistribution,
  compact = false,
  showPercentage = false,
}: CoverageDistributionProps) {
  // Calculate topic statistics
  const { chartData, balanceScore, underRepresented, avgPercentage } = useMemo(() => {
    const entries = Object.entries(topicCounts);
    const avgPct = entries.length > 0 ? 100 / entries.length : 0;
    const threshold = avgPct * 0.5; // Under-represented if less than 50% of average

    const data: TopicData[] = entries
      .map(([name, count]) => {
        const percentage = totalRecords > 0 ? (count / totalRecords) * 100 : 0;
        return {
          name,
          count,
          percentage,
          target: targetDistribution?.[name],
          isUnderRepresented: percentage < threshold,
        };
      })
      .sort((a, b) => b.count - a.count);

    const percentages = data.map((t) => t.percentage);
    const score = calculateBalanceScore(percentages);
    const under = data.filter((t) => t.isUnderRepresented);

    return {
      chartData: data,
      balanceScore: score,
      underRepresented: under,
      avgPercentage: avgPct,
    };
  }, [topicCounts, totalRecords, targetDistribution]);

  const balanceStatus = getBalanceStatus(balanceScore);

  if (chartData.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 text-center">
        <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">No topic data available</p>
        <p className="text-xs text-muted-foreground mt-1">
          Define topics and categorize records to see distribution
        </p>
      </div>
    );
  }

  const chartHeight = compact ? 150 : Math.max(200, chartData.length * 32);

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {/* Header with balance score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Coverage Distribution</span>
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
            balanceStatus.bgColor,
            balanceStatus.color
          )}
        >
          <TrendingUp className="h-3 w-3" />
          Balance: {(balanceScore * 100).toFixed(0)}% ({balanceStatus.label})
        </div>
      </div>

      {/* Horizontal Bar Chart */}
      <div style={{ height: chartHeight }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 60, left: 0, bottom: 5 }}
          >
            <XAxis
              type="number"
              domain={[0, showPercentage ? 100 : "dataMax"]}
              tickFormatter={(value) =>
                showPercentage ? `${value}%` : value.toLocaleString()
              }
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* Average line for reference */}
            {showPercentage && (
              <ReferenceLine
                x={avgPercentage}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                strokeOpacity={0.5}
              />
            )}
            <Bar
              dataKey={showPercentage ? "percentage" : "count"}
              radius={[0, 4, 4, 0]}
              maxBarSize={24}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.isUnderRepresented
                      ? "hsl(var(--chart-warning, 38 92% 50%))"
                      : "hsl(var(--primary))"
                  }
                  fillOpacity={entry.isUnderRepresented ? 0.7 : 0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recommendations for under-represented topics */}
      {underRepresented.length > 0 && !compact && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-medium text-amber-700 dark:text-amber-400">
                Under-represented topics detected
              </p>
              {underRepresented.slice(0, 3).map((topic) => {
                const needed = Math.ceil(
                  (avgPercentage / 100) * totalRecords - topic.count
                );
                return (
                  <p
                    key={topic.name}
                    className="text-amber-600/80 dark:text-amber-400/80"
                  >
                    <strong>{topic.name}</strong> has only{" "}
                    {topic.percentage.toFixed(1)}%.
                    {needed > 0 &&
                      ` Recommend generating ~${needed.toLocaleString()} more.`}
                  </p>
                );
              })}
              {underRepresented.length > 3 && (
                <p className="text-amber-600/60 dark:text-amber-400/60">
                  +{underRepresented.length - 3} more under-represented topics
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline badge showing balance score
 */
export function CoverageBalanceBadge({
  topicCounts,
  totalRecords,
}: {
  topicCounts: Record<string, number>;
  totalRecords: number;
}) {
  const percentages = Object.values(topicCounts).map((count) =>
    totalRecords > 0 ? (count / totalRecords) * 100 : 0
  );
  const balanceScore = calculateBalanceScore(percentages);
  const status = getBalanceStatus(balanceScore);

  if (Object.keys(topicCounts).length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        status.bgColor,
        status.color
      )}
    >
      <BarChart3 className="h-3 w-3" />
      <span>Balance: {(balanceScore * 100).toFixed(0)}%</span>
    </div>
  );
}
