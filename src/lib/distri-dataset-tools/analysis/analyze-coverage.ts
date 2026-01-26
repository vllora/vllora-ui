/**
 * Coverage Analysis Service
 *
 * Analyzes topic distribution and balance in datasets.
 * Provides recommendations for synthetic data generation.
 */

import { DatasetRecord, TopicHierarchyConfig, TopicHierarchyNode } from '@/types/dataset-types';
import {
  CoverageReport,
  TopicDistribution,
  TargetDistribution,
  GapRecommendation,
  GenerationTargets,
  getBalanceRating,
} from '@/types/coverage-types';

/**
 * Extract all leaf topic names from a hierarchy
 */
export function extractLeafTopics(nodes: TopicHierarchyNode[]): string[] {
  const leafTopics: string[] = [];

  function traverse(node: TopicHierarchyNode) {
    if (!node.children || node.children.length === 0) {
      leafTopics.push(node.name);
    } else {
      node.children.forEach(traverse);
    }
  }

  nodes.forEach(traverse);
  return leafTopics;
}

/**
 * Count records per topic
 */
export function countRecordsByTopic(
  records: DatasetRecord[]
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const record of records) {
    const topic = record.topic || '__uncategorized__';
    counts[topic] = (counts[topic] || 0) + 1;
  }

  return counts;
}

/**
 * Calculate balance score (0-1)
 *
 * Uses normalized entropy as the balance metric.
 * Perfect balance = 1, completely imbalanced = 0
 */
export function calculateBalanceScore(
  distribution: Record<string, number>,
  excludeUncategorized: boolean = true
): number {
  // Filter out uncategorized if requested
  const entries = Object.entries(distribution).filter(
    ([topic]) => !excludeUncategorized || topic !== '__uncategorized__'
  );

  if (entries.length <= 1) return 1; // Single topic or empty is perfectly balanced

  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return 1;

  // Calculate normalized entropy
  let entropy = 0;
  for (const [, count] of entries) {
    if (count > 0) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
  }

  // Maximum entropy for n categories
  const maxEntropy = Math.log2(entries.length);

  // Normalized entropy (0-1)
  return maxEntropy > 0 ? entropy / maxEntropy : 1;
}

/**
 * Alternative: Simple min/max ratio balance score
 */
export function calculateSimpleBalanceScore(
  distribution: Record<string, number>,
  excludeUncategorized: boolean = true
): number {
  const entries = Object.entries(distribution).filter(
    ([topic]) => !excludeUncategorized || topic !== '__uncategorized__'
  );

  if (entries.length <= 1) return 1;

  const counts = entries.map(([, count]) => count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);

  if (max === 0) return 1;
  return min / max;
}

/**
 * Analyze coverage and generate report
 */
export function analyzeCoverage(
  records: DatasetRecord[],
  hierarchy: TopicHierarchyConfig | null,
  targets?: TargetDistribution,
  validRecordIds?: Set<string>
): CoverageReport {
  // Filter to valid records if provided
  const validRecords = validRecordIds
    ? records.filter((r) => validRecordIds.has(r.id))
    : records;

  // Count by topic
  const counts = countRecordsByTopic(validRecords);

  // Get expected topics from hierarchy
  const expectedTopics = hierarchy?.hierarchy
    ? extractLeafTopics(hierarchy.hierarchy)
    : [];

  // Calculate distribution
  const distribution: Record<string, TopicDistribution> = {};
  const total = validRecords.length;
  const uncategorizedCount = counts['__uncategorized__'] || 0;
  const categorizedTotal = total - uncategorizedCount;

  // Default target: equal distribution across known topics
  const defaultTargetPercentage =
    expectedTopics.length > 0 ? 100 / expectedTopics.length : 0;

  for (const topic of expectedTopics) {
    const count = counts[topic] || 0;
    const percentage = categorizedTotal > 0 ? (count / categorizedTotal) * 100 : 0;
    const targetPercentage = targets?.[topic] ?? defaultTargetPercentage;
    const gap = percentage - targetPercentage;

    let status: 'under' | 'ok' | 'over';
    if (gap < -10) {
      status = 'under';
    } else if (gap > 10) {
      status = 'over';
    } else {
      status = 'ok';
    }

    distribution[topic] = {
      count,
      percentage,
      targetPercentage,
      gap,
      status,
    };
  }

  // Calculate balance score (using categorized records only)
  const categorizedCounts: Record<string, number> = {};
  for (const topic of expectedTopics) {
    categorizedCounts[topic] = counts[topic] || 0;
  }
  const balanceScore = calculateBalanceScore(categorizedCounts, false);
  const balanceRating = getBalanceRating(balanceScore);

  // Generate recommendations
  const recommendations = generateCoverageRecommendations(
    distribution,
    total,
    uncategorizedCount
  );

  return {
    timestamp: new Date().toISOString(),
    totalRecords: records.length,
    validRecords: validRecords.length,
    distribution,
    balanceScore,
    balanceRating,
    recommendations,
    uncategorizedCount,
    uncategorizedPercentage: total > 0 ? (uncategorizedCount / total) * 100 : 0,
  };
}

/**
 * Generate recommendations based on coverage analysis
 */
export function generateCoverageRecommendations(
  distribution: Record<string, TopicDistribution>,
  totalRecords: number,
  uncategorizedCount: number
): string[] {
  const recommendations: string[] = [];

  // Check for uncategorized records
  if (uncategorizedCount > 0) {
    const percentage = ((uncategorizedCount / totalRecords) * 100).toFixed(1);
    recommendations.push(
      `${uncategorizedCount} records (${percentage}%) are uncategorized. Run auto-tagging to classify them.`
    );
  }

  // Check for underrepresented topics
  const underTopics = Object.entries(distribution)
    .filter(([, dist]) => dist.status === 'under')
    .sort((a, b) => a[1].gap - b[1].gap);

  if (underTopics.length > 0) {
    const topicNames = underTopics.slice(0, 3).map(([name]) => name);
    recommendations.push(
      `Underrepresented topics: ${topicNames.join(', ')}. Consider generating synthetic data.`
    );
  }

  // Check for overrepresented topics
  const overTopics = Object.entries(distribution)
    .filter(([, dist]) => dist.status === 'over')
    .sort((a, b) => b[1].gap - a[1].gap);

  if (overTopics.length > 0) {
    const topicNames = overTopics.slice(0, 3).map(([name]) => name);
    recommendations.push(
      `Overrepresented topics: ${topicNames.join(', ')}. Dataset may be biased toward these.`
    );
  }

  // Check for empty topics
  const emptyTopics = Object.entries(distribution)
    .filter(([, dist]) => dist.count === 0)
    .map(([name]) => name);

  if (emptyTopics.length > 0) {
    recommendations.push(
      `Empty topics: ${emptyTopics.join(', ')}. Generate data for these or remove from hierarchy.`
    );
  }

  // Check minimum dataset size
  if (totalRecords < 100) {
    recommendations.push(
      `Dataset has only ${totalRecords} records. Consider adding more data for better training.`
    );
  }

  return recommendations;
}

/**
 * Calculate generation targets to fill gaps
 */
export function calculateGenerationTargets(
  coverageReport: CoverageReport,
  targetTotalRecords?: number
): GenerationTargets {
  const { distribution, validRecords, balanceScore } = coverageReport;

  // Default target: double current size or at least 500 records
  const targetTotal = targetTotalRecords || Math.max(validRecords * 2, 500);
  const currentCategorized = validRecords - coverageReport.uncategorizedCount;
  const additionalNeeded = Math.max(0, targetTotal - currentCategorized);

  const recommendations: GapRecommendation[] = [];

  // Calculate how many records each topic should have
  const topics = Object.entries(distribution);
  const targetPerTopic = targetTotal / topics.length;

  for (const [topic, dist] of topics) {
    const targetCount = Math.round(targetPerTopic);
    const gap = targetCount - dist.count;

    if (gap > 0) {
      recommendations.push({
        topic,
        currentCount: dist.count,
        targetCount,
        gap,
        priority: gap > targetPerTopic * 0.5 ? 'high' : gap > targetPerTopic * 0.25 ? 'medium' : 'low',
      });
    }
  }

  // Sort by gap (highest first)
  recommendations.sort((a, b) => b.gap - a.gap);

  // Estimate balance after generation
  const totalToGenerate = recommendations.reduce((sum, r) => sum + r.gap, 0);
  const estimatedBalanceAfter = Math.min(1, balanceScore + 0.2); // Rough estimate

  return {
    recommendations,
    totalToGenerate: Math.min(totalToGenerate, additionalNeeded),
    estimatedBalanceAfter,
  };
}

/**
 * Get topics sorted by priority for generation
 */
export function getTopicsPrioritizedForGeneration(
  coverageReport: CoverageReport
): string[] {
  const targets = calculateGenerationTargets(coverageReport);
  return targets.recommendations
    .filter((r) => r.gap > 0)
    .map((r) => r.topic);
}
