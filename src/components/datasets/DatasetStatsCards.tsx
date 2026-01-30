/**
 * DatasetStatsCards
 *
 * Displays key dataset statistics in a grid of cards.
 * Consumes DatasetDetailContext to avoid prop drilling.
 */

import { useMemo } from "react";
import { FolderTree, PieChart } from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { cn } from "@/lib/utils";
import { computeCoverageStats, computeDatasetInsights } from "./record-utils";

// ============================================================================
// StatCard Component
// ============================================================================

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color?: "default" | "violet" | "blue" | "emerald" | "amber" | "red";
}

function StatCard({ icon, label, value, subValue, color = "default" }: StatCardProps) {
  const colorClasses = {
    default: "bg-muted/50 text-foreground",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    red: "bg-red-500/10 text-red-600 dark:text-red-400",
  };

  return (
    <div className={cn("flex items-center gap-3 px-4 py-3 rounded-lg", colorClasses[color])}>
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-semibold text-lg leading-tight">{value}</div>
        {subValue && <div className="text-xs text-muted-foreground">{subValue}</div>}
      </div>
    </div>
  );
}

// ============================================================================
// RecordsDonutCard - Combined card with donut chart
// ============================================================================

interface RecordsDonutCardProps {
  total: number;
  original: number;
  generated: number;
}

function RecordsDonutCard({ total, original, generated }: RecordsDonutCardProps) {
  const generatedPercent = total > 0 ? (generated / total) * 100 : 0;
  const originalPercent = total > 0 ? (original / total) * 100 : 0;

  // CSS conic-gradient for donut chart
  // Original = muted gray, Generated = violet
  const gradientStyle = total > 0
    ? {
        background: `conic-gradient(
          rgb(139 92 246) 0% ${generatedPercent}%,
          rgb(156 163 175) ${generatedPercent}% 100%
        )`,
      }
    : { background: "rgb(156 163 175)" };

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
          <span className="text-xs font-semibold">{total}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground mb-1">Records</div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
            <span className="text-muted-foreground">Original</span>
            <span className="font-medium ml-auto">{original.toLocaleString()}</span>
            <span className="text-muted-foreground w-10 text-right">{Math.round(originalPercent)}%</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
            <span className="text-muted-foreground">Generated</span>
            <span className="font-medium ml-auto">{generated.toLocaleString()}</span>
            <span className="text-muted-foreground w-10 text-right">{Math.round(generatedPercent)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DatasetStatsCards Component
// ============================================================================

export function DatasetStatsCards() {
  const { dataset, records } = DatasetDetailConsumer();

  // const coverageStats = dataset?.coverageStats;

  // Use shared utility for computing insights (memoized on records change)
  const insights = useMemo(() => computeDatasetInsights(records), [records]);
  const coverageStats = useMemo(() => computeCoverageStats({
    records,
    topic_hierarchy: dataset?.topicHierarchy
  }), [records, dataset?.topicHierarchy]);

  // Balance rating color
  const getBalanceColor = (): StatCardProps["color"] => {
    if (!coverageStats) return "default";
    switch (coverageStats.balanceRating) {
      case "excellent":
      case "good":
        return "emerald";
      case "fair":
        return "amber";
      default:
        return "red";
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* Records with Donut Chart */}
      <RecordsDonutCard
        total={insights.totalRecords}
        original={insights.originalRecords}
        generated={insights.generatedRecords}
      />

      {/* Topics & Coverage */}
      <StatCard
        icon={<FolderTree className="w-5 h-5" />}
        label="Topics"
        value={insights.topicCount > 0 ? insights.topicCount : "—"}
        subValue={insights.topicCount > 0 ? `${insights.categorizedPercent}% categorized` : "Not configured"}
        color={insights.topicCount > 0 ? "blue" : "default"}
      />

      {/* Balance */}
      <StatCard
        icon={<PieChart className="w-5 h-5" />}
        label="Balance"
        value={coverageStats?.balanceRating ?? "—"}
        subValue={coverageStats ? `Score: ${Math.round(coverageStats.balanceScore * 100)}%` : "Run coverage analysis"}
        color={getBalanceColor()}
      />
    </div>
  );
}
