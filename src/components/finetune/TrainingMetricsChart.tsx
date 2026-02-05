/**
 * TrainingMetricsChart
 *
 * Visualizes training evaluation metrics with epoch-over-epoch progress charts.
 * Shows overall score trends and per-criteria breakdowns.
 */

import { useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, TrendingUp, BarChart3 } from "lucide-react";
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

interface RowData {
  rowIndex: number;
  prompt: string;
  epochs: {
    epoch: number;
    score: number;
    breakdown: ScoreBreakdown;
  }[];
}

export function TrainingMetricsChart({
  results,
  className,
}: TrainingMetricsChartProps) {
  const [showRowDetails, setShowRowDetails] = useState(false);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  // Process data for charts
  const { epochData, rowData, criteriaNames, latestCriteriaAvg } = useMemo(() => {
    const epochMap = new Map<
      number,
      { scores: number[]; breakdowns: ScoreBreakdown[] }
    >();
    const rowDataList: RowData[] = [];

    // Process each row's epoch results
    for (const row of results) {
      const rowEpochs: RowData["epochs"] = [];
      const prompt = extractPrompt(row.row);

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

            rowEpochs.push({
              epoch,
              score: result.score,
              breakdown,
            });
          }
        }
      }

      rowDataList.push({
        rowIndex: row.row_index,
        prompt,
        epochs: rowEpochs.sort((a, b) => a.epoch - b.epoch),
      });
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
      rowData: rowDataList,
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
    <div className={cn("space-y-4", className)}>
      {/* Epoch Progress Chart */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h5 className="text-xs font-medium">Epoch Progress</h5>
        </div>

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
      </div>

      {/* Criteria Breakdown Bar Chart (if available) */}
      {hasBreakdown && Object.keys(latestCriteriaAvg).length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h5 className="text-xs font-medium">
              Latest Criteria Scores (Epoch {epochData[epochData.length - 1]?.epoch})
            </h5>
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
        </div>
      )}

      {/* Row Details Expandable Section */}
      <div className="border-t pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1 -ml-2"
          onClick={() => setShowRowDetails(!showRowDetails)}
        >
          {showRowDetails ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Per-Row Details ({rowData.length} rows)
        </Button>

        {showRowDetails && (
          <div className="mt-2 space-y-2 max-h-[300px] overflow-y-auto">
            {rowData.map((row) => (
              <RowDetailCard
                key={row.rowIndex}
                row={row}
                isExpanded={selectedRow === row.rowIndex}
                onToggle={() =>
                  setSelectedRow(
                    selectedRow === row.rowIndex ? null : row.rowIndex
                  )
                }
                criteriaNames={criteriaNames}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Sub-component for individual row details
interface RowDetailCardProps {
  row: RowData;
  isExpanded: boolean;
  onToggle: () => void;
  criteriaNames: string[];
}

function RowDetailCard({
  row,
  isExpanded,
  onToggle,
  criteriaNames,
}: RowDetailCardProps) {
  const latestEpoch = row.epochs[row.epochs.length - 1];
  const latestScore = latestEpoch?.score ?? 0;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </div>

        <span className="text-xs font-mono text-muted-foreground w-12">
          #{row.rowIndex}
        </span>

        <span className="text-xs flex-1 truncate" title={row.prompt}>
          {row.prompt}
        </span>

        <div className="flex items-center gap-2">
          {/* Mini epoch indicators */}
          <div className="flex gap-0.5">
            {row.epochs.map((e) => (
              <div
                key={e.epoch}
                className={cn(
                  "w-2 h-2 rounded-full",
                  e.score >= 0.8
                    ? "bg-green-500"
                    : e.score >= 0.6
                    ? "bg-yellow-500"
                    : "bg-red-500"
                )}
                title={`Epoch ${e.epoch}: ${formatScore(e.score)}`}
              />
            ))}
          </div>

          <span
            className={cn(
              "text-xs font-medium px-1.5 py-0.5 rounded",
              getScoreBgClass(latestScore),
              getScoreColorClass(latestScore)
            )}
          >
            {formatScore(latestScore)}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 py-2 border-t bg-muted/20 space-y-2">
          {/* Prompt */}
          <div className="text-xs">
            <span className="text-muted-foreground">Prompt: </span>
            <span className="font-mono">{row.prompt}</span>
          </div>

          {/* Epoch scores table */}
          <div className="text-xs">
            <table className="w-full">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left py-1 pr-2 w-16">Epoch</th>
                  <th className="text-left py-1 pr-2 w-16">Score</th>
                  {criteriaNames.map((c) => (
                    <th key={c} className="text-left py-1 pr-2 w-16">
                      {c}
                    </th>
                  ))}
                  <th className="text-left py-1">Reasoning</th>
                </tr>
              </thead>
              <tbody>
                {row.epochs.map((e) => (
                  <tr key={e.epoch} className="border-t border-border/50">
                    <td className="py-1 pr-2 font-mono">{e.epoch}</td>
                    <td
                      className={cn(
                        "py-1 pr-2 font-mono",
                        getScoreColorClass(e.score)
                      )}
                    >
                      {formatScore(e.score)}
                    </td>
                    {criteriaNames.map((c) => (
                      <td
                        key={c}
                        className={cn(
                          "py-1 pr-2 font-mono",
                          e.breakdown.criteria[c] !== undefined
                            ? getScoreColorClass(e.breakdown.criteria[c])
                            : "text-muted-foreground"
                        )}
                      >
                        {e.breakdown.criteria[c] !== undefined
                          ? formatScore(e.breakdown.criteria[c])
                          : "-"}
                      </td>
                    ))}
                    <td className="py-1 text-muted-foreground truncate max-w-[200px]">
                      {e.breakdown.reasoning || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Extract the user prompt from a row's data
 */
function extractPrompt(row: Record<string, unknown>): string {
  // Try to find messages in common structures
  const input = row.input as Record<string, unknown> | undefined;
  const messages = (input?.messages || row.messages) as
    | Array<{ role: string; content: string }>
    | undefined;

  if (messages && Array.isArray(messages)) {
    // Find the last user message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        const content = messages[i].content;
        return content.length > 100 ? content.slice(0, 100) + "..." : content;
      }
    }
    // Fall back to first message content
    if (messages[0]?.content) {
      const content = messages[0].content;
      return content.length > 100 ? content.slice(0, 100) + "..." : content;
    }
  }

  return "No prompt available";
}
