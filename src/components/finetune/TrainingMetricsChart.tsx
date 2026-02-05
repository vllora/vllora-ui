/**
 * TrainingMetricsChart
 *
 * Visualizes training evaluation metrics with epoch-over-epoch progress charts.
 * Shows overall score trends and per-criteria breakdowns.
 */

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, BarChart3 } from "lucide-react";
import type { FinetuneEvalResultsResponse } from "@/services/finetune-api";
import {
  parseScoreBreakdown,
  getAllCriteriaNames,
  averageCriteriaScores,
  getScoreColorClass,
  getScoreBgClass,
  formatScore,
  type ScoreBreakdown,
} from "@/utils/parse-score-breakdown";

interface TrainingMetricsChartProps {
  results: FinetuneEvalResultsResponse["results"];
  className?: string;
}

// Chart color palette
const CHART_COLORS = [
  "hsl(var(--theme-500))", // Primary theme color
  "#10b981", // Green
  "#f59e0b", // Amber
  "#6366f1", // Indigo
  "#ec4899", // Pink
  "#8b5cf6", // Purple
];

interface EpochData {
  epoch: number;
  avgScore: number;
  rowCount: number;
  criteriaAvg: Record<string, number>;
}

export function TrainingMetricsChart({
  results,
  className,
}: TrainingMetricsChartProps) {
  // Process data for charts
  const { epochData, criteriaNames, latestCriteriaAvg } = useMemo(() => {
    const epochMap = new Map<
      number,
      { scores: number[]; breakdowns: ScoreBreakdown[] }
    >();

    // Process each row's epoch results
    for (const row of results) {
      for (const [epochStr, evalResults] of Object.entries(row.epochs)) {
        const epoch = parseInt(epochStr, 10);

        if (!epochMap.has(epoch)) {
          epochMap.set(epoch, { scores: [], breakdowns: [] });
        }
        const epochStats = epochMap.get(epoch)!;

        for (const result of evalResults) {
          const breakdown = parseScoreBreakdown(result.reason);

          if (typeof result.score === "number") {
            epochStats.scores.push(result.score);
            epochStats.breakdowns.push(breakdown);
          }
        }
      }
    }

    // Build epoch data for charts
    const sortedEpochs = Array.from(epochMap.entries()).sort(
      ([a], [b]) => a - b
    );
    const epochDataList: EpochData[] = sortedEpochs.map(([epoch, stats]) => {
      const avgScore =
        stats.scores.length > 0
          ? stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length
          : 0;
      const criteriaAvg = averageCriteriaScores(stats.breakdowns);

      return {
        epoch,
        avgScore,
        rowCount: stats.scores.length,
        criteriaAvg,
      };
    });

    // Get all criteria names
    const criteriaNamesList = getAllCriteriaNames(
      Array.from(epochMap.values()).flatMap((s) => s.breakdowns)
    );

    // Get latest epoch criteria averages
    const latestAvg =
      epochDataList.length > 0
        ? epochDataList[epochDataList.length - 1].criteriaAvg
        : {};

    return {
      epochData: epochDataList,
      criteriaNames: criteriaNamesList,
      latestCriteriaAvg: latestAvg,
    };
  }, [results]);

  if (epochData.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No epoch data available for visualization
      </div>
    );
  }

  // Prepare chart data with criteria as separate series (0-1 scale)
  const chartData = epochData.map((epoch) => ({
    name: `Epoch ${epoch.epoch}`,
    epoch: epoch.epoch,
    "Avg Score": parseFloat(epoch.avgScore.toFixed(2)),
    ...Object.fromEntries(
      Object.entries(epoch.criteriaAvg).map(([key, val]) => [
        key,
        parseFloat(val.toFixed(2)),
      ])
    ),
  }));

  const hasBreakdown = criteriaNames.length > 0;

  return (
    <div className={cn("space-y-2", className)}>
      <Tabs defaultValue="progress" className="w-full">
        <TabsList className="h-8">
          <TabsTrigger value="progress" className="text-xs gap-1.5 h-7">
            <TrendingUp className="h-3.5 w-3.5" />
            Progress
          </TabsTrigger>
          {hasBreakdown && Object.keys(latestCriteriaAvg).length > 0 && (
            <TabsTrigger value="criteria" className="text-xs gap-1.5 h-7">
              <BarChart3 className="h-3.5 w-3.5" />
              Criteria
            </TabsTrigger>
          )}
        </TabsList>

        {/* Epoch Progress Tab */}
        <TabsContent value="progress" className="mt-3">
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-muted/30"
                />
                <XAxis
                  dataKey="name"
                  className="text-xs"
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  domain={[0, 1]}
                  className="text-xs"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v.toFixed(1)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value) => [typeof value === 'number' ? value.toFixed(2) : value, ""]}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Line
                  type="monotone"
                  dataKey="Avg Score"
                  stroke={CHART_COLORS[0]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                {hasBreakdown &&
                  criteriaNames.map((criteria, idx) => (
                    <Line
                      key={criteria}
                      type="monotone"
                      dataKey={criteria}
                      stroke={CHART_COLORS[(idx + 1) % CHART_COLORS.length]}
                      strokeWidth={1.5}
                      dot={{ r: 3 }}
                      strokeDasharray="5 5"
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        {/* Criteria Breakdown Tab */}
        {hasBreakdown && Object.keys(latestCriteriaAvg).length > 0 && (
          <TabsContent value="criteria" className="mt-3 space-y-3">
            <div className="text-xs text-muted-foreground">
              Latest Criteria Scores (Epoch {epochData[epochData.length - 1]?.epoch})
            </div>

            <div className="h-[120px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={Object.entries(latestCriteriaAvg).map(([key, val]) => ({
                    name: key,
                    score: parseFloat(val.toFixed(2)),
                  }))}
                  layout="vertical"
                  margin={{ top: 5, right: 20, bottom: 5, left: 60 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted/30"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    domain={[0, 1]}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => v.toFixed(1)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    width={55}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value) => [typeof value === 'number' ? value.toFixed(2) : value, "Score"]}
                  />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                    {Object.entries(latestCriteriaAvg).map(([_, val], index) => (
                      <Cell
                        key={index}
                        fill={
                          val >= 0.8
                            ? "#10b981"
                            : val >= 0.6
                            ? "#f59e0b"
                            : "#ef4444"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Criteria Score Pills */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(latestCriteriaAvg).map(([key, val]) => (
                <div
                  key={key}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-medium",
                    getScoreBgClass(val),
                    getScoreColorClass(val)
                  )}
                >
                  {key}: {formatScore(val)}
                </div>
              ))}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
