/**
 * InsightsPane
 *
 * Renders real-time markdown insights for dataset analysis.
 * Each insight file (coverage.md, balance.md, quality-scores.md)
 * is generated from actual dataset data — never placeholder/fake data.
 *
 * When the dataset is empty, the explorer sidebar hides insight files
 * entirely, so this component only renders when there's real data.
 */

import { useMemo } from "react";
import LazyMarkdownRenderer from "@/components/chat/LazyMarkdownRenderer";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import type { KnowledgeCoverageStats } from "@/types/dataset-types";
import { DryRunJobsConsumer } from "@/contexts/DryRunJobsContext";
import { BALANCE_RATING_DESCRIPTIONS } from "@/types/coverage-types";
import type { BalanceRating } from "@/types/coverage-types";

interface InsightsPaneProps {
  /** Which insight file to render: "coverage", "balance", or "quality-scores" */
  insightType: "coverage" | "balance" | "quality-scores";
}

// ============================================================================
// Markdown generators — pure functions, dataset data → markdown string
// ============================================================================

function generateCoverageMarkdown(opts: {
  totalRecords: number;
  generatedRecords: number;
  originalRecords: number;
  topicDistribution: Record<string, number>;
  uncategorizedCount: number;
  balanceScore?: number;
  balanceRating?: BalanceRating;
  knowledgeCoverage?: KnowledgeCoverageStats | null;
}): string {
  const {
    totalRecords, generatedRecords, originalRecords,
    topicDistribution, uncategorizedCount,
    balanceScore, balanceRating, knowledgeCoverage,
  } = opts;

  const lines: string[] = [];
  lines.push("# Coverage Report");
  lines.push("");
  lines.push("## Dataset Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Records | ${totalRecords} |`);
  lines.push(`| Original | ${originalRecords} |`);
  lines.push(`| Generated | ${generatedRecords} |`);
  lines.push(`| Generated % | ${totalRecords > 0 ? ((generatedRecords / totalRecords) * 100).toFixed(1) : 0}% |`);

  if (balanceScore != null) {
    lines.push(`| Balance Score | ${(balanceScore * 100).toFixed(0)}% (${balanceRating ?? "n/a"}) |`);
  }

  lines.push("");

  // Topic distribution table
  const topics = Object.entries(topicDistribution).sort((a, b) => b[1] - a[1]);
  if (topics.length > 0) {
    lines.push("## Topic Distribution");
    lines.push("");
    lines.push(`| Topic | Records | % |`);
    lines.push(`|-------|---------|---|`);
    for (const [topic, count] of topics) {
      const pct = totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) : "0.0";
      lines.push(`| ${topic} | ${count} | ${pct}% |`);
    }
    if (uncategorizedCount > 0) {
      const pct = ((uncategorizedCount / totalRecords) * 100).toFixed(1);
      lines.push(`| *(uncategorized)* | ${uncategorizedCount} | ${pct}% |`);
    }
    lines.push("");
  }

  // Knowledge source coverage section
  if (knowledgeCoverage) {
    lines.push("## Knowledge Source Coverage");
    lines.push("");
    lines.push(`| Source | Covered | Total | % |`);
    lines.push(`|--------|---------|-------|---|`);
    for (const [, info] of Object.entries(knowledgeCoverage.bySource)) {
      lines.push(`| ${info.sourceName} | ${info.coveredChunks} | ${info.totalChunks} | ${info.coveragePercent}% |`);
    }
    lines.push("");
    lines.push(`**Overall:** ${knowledgeCoverage.coveredChunks} of ${knowledgeCoverage.totalChunks} chunks covered (${knowledgeCoverage.coveragePercent}%)`);
    lines.push("");

    // List uncovered content as recommendations
    const uncoveredSources = Object.values(knowledgeCoverage.bySource)
      .filter((s) => s.uncoveredChunkIds.length > 0);
    if (uncoveredSources.length > 0) {
      lines.push("*Uncovered content:*");
      for (const source of uncoveredSources) {
        lines.push(`- **${source.sourceName}**: ${source.uncoveredChunkIds.length} chunk${source.uncoveredChunkIds.length !== 1 ? "s" : ""} not yet in training data`);
      }
      lines.push("");
    }
  }

  // Recommendations
  lines.push("## Recommendations");
  lines.push("");
  if (totalRecords === 0) {
    lines.push("- Upload or generate training data to begin coverage analysis.");
  } else if (topics.length === 0) {
    lines.push("- Configure topic hierarchy and categorize records to see coverage.");
  } else {
    if (balanceRating === "excellent" || balanceRating === "good") {
      lines.push("- Topic distribution looks healthy. Consider running an evaluation to assess quality.");
    }
    if (balanceRating === "fair") {
      lines.push("- Some topics are underrepresented. Generate more data for underperforming topics.");
    }
    if (balanceRating === "poor" || balanceRating === "critical") {
      lines.push("- Significant imbalance detected. Focus data generation on the smallest topics.");
    }
    if (uncategorizedCount > 0) {
      lines.push(`- ${uncategorizedCount} record${uncategorizedCount > 1 ? "s" : ""} are uncategorized. Assign topics to improve coverage analysis.`);
    }
    if (knowledgeCoverage && knowledgeCoverage.coveragePercent < 70) {
      lines.push(`- Knowledge coverage is ${knowledgeCoverage.coveragePercent}%. Generate more data to cover remaining knowledge source chunks.`);
    }
  }

  return lines.join("\n");
}

function generateBalanceMarkdown(opts: {
  balanceScore: number;
  balanceRating: BalanceRating;
  topicDistribution: Record<string, number>;
  totalRecords: number;
}): string {
  const { balanceScore, balanceRating, topicDistribution, totalRecords } = opts;

  const lines: string[] = [];
  lines.push("# Balance Analysis");
  lines.push("");
  lines.push(`**Balance Score:** ${(balanceScore * 100).toFixed(0)}% — ${BALANCE_RATING_DESCRIPTIONS[balanceRating]}`);
  lines.push("");

  // Visualize balance with a simple bar chart in markdown
  const topics = Object.entries(topicDistribution).sort((a, b) => b[1] - a[1]);
  const maxCount = topics.length > 0 ? topics[0][1] : 0;

  if (topics.length > 0) {
    lines.push("## Distribution");
    lines.push("");
    const idealPct = (100 / topics.length).toFixed(1);
    lines.push(`*Ideal per-topic share: ~${idealPct}%*`);
    lines.push("");

    for (const [topic, count] of topics) {
      const pct = totalRecords > 0 ? (count / totalRecords) * 100 : 0;
      const barLen = maxCount > 0 ? Math.round((count / maxCount) * 20) : 0;
      const bar = "█".repeat(barLen) + "░".repeat(20 - barLen);
      lines.push(`\`${bar}\` **${topic}** — ${count} (${pct.toFixed(1)}%)`);
    }

    lines.push("");
    lines.push("## What This Means");
    lines.push("");

    if (balanceRating === "excellent") {
      lines.push("Your dataset is well-balanced across topics. Training should produce a model with consistent performance across all topics.");
    } else if (balanceRating === "good") {
      lines.push("Your dataset has minor imbalances but is generally well-distributed. Training results should be good, but the model may perform slightly better on topics with more data.");
    } else if (balanceRating === "fair") {
      lines.push("There are noticeable gaps in your topic distribution. The model may underperform on topics with fewer examples. Consider generating more data for underrepresented topics.");
    } else {
      lines.push("Your dataset has significant imbalance. The model will likely struggle with underrepresented topics. **Prioritize generating data for the smallest topics before training.**");
    }
  }

  return lines.join("\n");
}

function generateQualityScoresMarkdown(opts: {
  dryRunStats?: {
    statistics: { mean: number; std: number; min: number; max: number; percentAboveZero: number; percentPerfect: number };
    distribution: Record<string, number>;
    samplesEvaluated: number;
    byTopic: Record<string, { mean: number; std: number; count: number; status: string }>;
    diagnosis: { verdict: string; datasetQuality: string; issues: Array<{ severity: string; message: string; suggestion: string }> };
  };
  lastRunAt?: number;
}): string {
  const { dryRunStats, lastRunAt } = opts;

  const lines: string[] = [];
  lines.push("# Quality Scores");
  lines.push("");

  if (!dryRunStats) {
    lines.push("*No evaluation results available yet. Run an evaluation to see quality scores.*");
    return lines.join("\n");
  }

  const { statistics, distribution, samplesEvaluated, byTopic, diagnosis } = dryRunStats;

  // Header stats
  lines.push("## Overview");
  lines.push("");
  if (lastRunAt) {
    lines.push(`*Last evaluated: ${new Date(lastRunAt).toLocaleDateString()} at ${new Date(lastRunAt).toLocaleTimeString()}*`);
    lines.push("");
  }
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Samples Evaluated | ${samplesEvaluated} |`);
  lines.push(`| Mean Score | ${statistics.mean.toFixed(3)} |`);
  lines.push(`| Std Dev | ${statistics.std.toFixed(3)} |`);
  lines.push(`| Min / Max | ${statistics.min.toFixed(3)} / ${statistics.max.toFixed(3)} |`);
  lines.push(`| % Above Zero | ${(statistics.percentAboveZero * 100).toFixed(1)}% |`);
  lines.push(`| % Perfect (1.0) | ${(statistics.percentPerfect * 100).toFixed(1)}% |`);
  lines.push(`| Verdict | **${diagnosis.verdict}** (${diagnosis.datasetQuality}) |`);
  lines.push("");

  // Score distribution (values are fractions 0-1, not counts)
  lines.push("## Score Distribution");
  lines.push("");
  const buckets = Object.entries(distribution);
  const maxBucket = Math.max(...buckets.map(([, v]) => v), 0.01);
  for (const [range, fraction] of buckets) {
    const pct = (fraction * 100).toFixed(1);
    const barLen = Math.round((fraction / maxBucket) * 15);
    const bar = "█".repeat(barLen) + "░".repeat(15 - barLen);
    lines.push(`\`${bar}\` **${range}** — ${pct}%`);
  }
  lines.push("");

  // Per-topic breakdown
  const topicEntries = Object.entries(byTopic);
  if (topicEntries.length > 0) {
    lines.push("## Per-Topic Scores");
    lines.push("");
    lines.push(`| Topic | Mean | Std | Samples | Status |`);
    lines.push(`|-------|------|-----|---------|--------|`);
    for (const [topic, stats] of topicEntries.sort((a, b) => b[1].mean - a[1].mean)) {
      lines.push(`| ${topic} | ${stats.mean.toFixed(3)} | ${stats.std.toFixed(3)} | ${stats.count} | ${stats.status} |`);
    }
    lines.push("");
  }

  // Issues & recommendations
  if (diagnosis.issues.length > 0) {
    lines.push("## Issues & Recommendations");
    lines.push("");
    for (const issue of diagnosis.issues) {
      const icon = issue.severity === "error" ? "🔴" : "🟡";
      lines.push(`${icon} **${issue.message}**`);
      lines.push(`  - ${issue.suggestion}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Component
// ============================================================================

export function InsightsPane({ insightType }: InsightsPaneProps) {
  const { dataset, records } = DatasetDetailConsumer();
  const { jobs: dryRunJobs } = DryRunJobsConsumer();

  const markdown = useMemo(() => {
    // Compute basic stats from records
    const totalRecords = records.length;
    const generatedRecords = records.filter((r) => r.is_generated).length;
    const originalRecords = totalRecords - generatedRecords;
    const topicDistribution: Record<string, number> = {};
    let uncategorizedCount = 0;
    for (const r of records) {
      if (r.topic) {
        topicDistribution[r.topic] = (topicDistribution[r.topic] || 0) + 1;
      } else {
        uncategorizedCount++;
      }
    }

    switch (insightType) {
      case "coverage":
        return generateCoverageMarkdown({
          totalRecords,
          generatedRecords,
          originalRecords,
          topicDistribution,
          uncategorizedCount,
          balanceScore: dataset?.coverageStats?.balanceScore,
          balanceRating: dataset?.coverageStats?.balanceRating,
          knowledgeCoverage: dataset?.knowledgeCoverageStats,
        });

      case "balance":
        if (dataset?.coverageStats?.balanceScore == null || !dataset?.coverageStats?.balanceRating) {
          return "# Balance Analysis\n\n*Run coverage analysis to see balance metrics.*";
        }
        return generateBalanceMarkdown({
          balanceScore: dataset.coverageStats.balanceScore,
          balanceRating: dataset.coverageStats.balanceRating,
          topicDistribution: dataset.coverageStats.topicDistribution ?? topicDistribution,
          totalRecords,
        });

      case "quality-scores": {
        const lastCompleted = dryRunJobs
          .filter((j) => j.status === "completed" && j.result)
          .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0];

        return generateQualityScoresMarkdown({
          dryRunStats: lastCompleted?.result as any,
          lastRunAt: lastCompleted?.completedAt,
        });
      }

      default:
        return "*No insight data available.*";
    }
  }, [insightType, records, dataset, dryRunJobs]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto prose prose-sm prose-invert">
          <LazyMarkdownRenderer content={markdown} />
        </div>
      </div>
    </div>
  );
}
