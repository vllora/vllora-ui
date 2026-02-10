/**
 * Dataset README Generator
 *
 * Generates and maintains a README markdown file for each dataset
 * that summarizes its current state, structure, and quality metrics.
 */

import type {
  Dataset,
  DatasetRecord,
  TopicHierarchyNode,
  DryRunStats,
  ScoreDistribution,
} from '@/types/dataset-types';
import type { FinetuneWorkflowState, FinetuneStep } from './finetune-workflow-db';

// =============================================================================
// Types
// =============================================================================

export interface KnowledgeSourceInfo {
  name: string;
  type: string;
  topics_extracted: string[];
  size?: number;
}

export interface SetupPlanSummary {
  executed_at: number;
  topics_created: number;
  records_generated: number;
  grader_configured: boolean;
  dry_run_completed: boolean;
}

export interface ReadmeGeneratorOptions {
  dataset: Dataset;
  records: DatasetRecord[];
  workflow?: FinetuneWorkflowState | null;
  /** Knowledge sources used to generate topics and data */
  knowledgeSources?: KnowledgeSourceInfo[];
  /** Summary from setup plan execution */
  setupPlanSummary?: SetupPlanSummary;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a timestamp as a readable date string
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get coverage status indicator based on percentage and count
 */
function getCoverageStatus(percentage: number, recordCount: number): string {
  if (percentage >= 20 && recordCount >= 50) return '✓ Good';
  if (percentage >= 10 && recordCount >= 20) return '✓ OK';
  if (percentage >= 5 && recordCount >= 10) return '⚠️ Medium';
  return '❌ Low';
}

/**
 * Get balance rating description
 */
function getBalanceDescription(rating?: string): string {
  switch (rating) {
    case 'excellent':
      return 'Excellent - Topics are very well balanced';
    case 'good':
      return 'Good - Topics are reasonably balanced';
    case 'fair':
      return 'Fair - Some topics need more records';
    case 'poor':
      return 'Poor - Topics are significantly imbalanced';
    case 'critical':
      return 'Critical - Major imbalance, needs attention';
    default:
      return 'Not calculated';
  }
}

/**
 * Format topic hierarchy as ASCII tree
 */
function formatTopicTree(
  nodes: TopicHierarchyNode[],
  recordsByTopic: Map<string, number>,
  prefix = '',
  parentPath = ''
): string {
  let result = '';

  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    // Try multiple ways to match: full path, node ID, or just the node name
    // Records may be saved with just the topic name (e.g., "FEN Insights")
    // rather than the full path ("Position Analysis/FEN Insights")
    const count = recordsByTopic.get(fullPath) || recordsByTopic.get(node.id) || recordsByTopic.get(node.name) || 0;
    result += `${prefix}${connector}${node.name} (${count})\n`;

    if (node.children?.length) {
      result += formatTopicTree(
        node.children,
        recordsByTopic,
        prefix + childPrefix,
        fullPath
      );
    }
  });

  return result;
}

/**
 * Count records by topic path
 */
function countRecordsByTopic(records: DatasetRecord[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const record of records) {
    const topic = record.topic || '__unassigned__';
    counts.set(topic, (counts.get(topic) || 0) + 1);
  }

  return counts;
}

/**
 * Get step status indicator
 */
function getStepIndicator(status: string, isCurrent: boolean): string {
  if (isCurrent) return '→ In Progress';
  switch (status) {
    case 'completed':
      return '✓ Complete';
    case 'failed':
      return '✗ Failed';
    case 'skipped':
      return '○ Skipped';
    default:
      return '○ Pending';
  }
}

/**
 * Format score distribution as ASCII histogram
 */
function formatScoreDistribution(distribution: ScoreDistribution): string {
  const buckets = [
    { label: '0.8-1.0', count: distribution['0.8-1.0'] || 0 },
    { label: '0.6-0.8', count: distribution['0.6-0.8'] || 0 },
    { label: '0.4-0.6', count: distribution['0.4-0.6'] || 0 },
    { label: '0.2-0.4', count: distribution['0.2-0.4'] || 0 },
    { label: '0.0-0.2', count: distribution['0.0-0.2'] || 0 },
  ];

  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) return 'No data';

  const maxCount = Math.max(...buckets.map((b) => b.count));
  const barWidth = 20;

  return buckets
    .map((b) => {
      const bars = maxCount > 0 ? '█'.repeat(Math.round((b.count / maxCount) * barWidth)) : '';
      const pct = total > 0 ? ((b.count / total) * 100).toFixed(0) : '0';
      return `${b.label}: ${bars.padEnd(barWidth)} ${b.count} (${pct}%)`;
    })
    .join('\n');
}

// =============================================================================
// Section Generators
// =============================================================================

function generateHeaderSection(dataset: Dataset): string {
  const objective = dataset.datasetObjective || '_No training objective defined_';

  return `# ${dataset.name}

> ${objective}`;
}

function generateOverviewSection(dataset: Dataset, records: DatasetRecord[]): string {
  const generatedCount = records.filter((r) => r.is_generated).length;
  const originalCount = records.length - generatedCount;
  const generatedPct = records.length > 0 ? ((generatedCount / records.length) * 100).toFixed(0) : '0';

  const topicCount = dataset.topicHierarchy?.hierarchy
    ? countTopics(dataset.topicHierarchy.hierarchy)
    : 0;

  const coverageScore = dataset.coverageStats?.balanceScore;
  const qualityScore = dataset.dryRunStats?.statistics?.mean;

  const rows = [
    ['Training Mode', 'RFT'],
    ['Total Records', records.length.toString()],
    ['Generated Records', `${generatedCount} (${generatedPct}%)`],
    ['Original Records', originalCount.toString()],
    ['Topics', topicCount.toString()],
  ];

  if (coverageScore !== undefined) {
    rows.push(['Coverage Score', coverageScore.toFixed(2)]);
  }

  if (qualityScore !== undefined) {
    rows.push(['Quality Score', qualityScore.toFixed(2)]);
  }

  const tableRows = rows.map(([metric, value]) => `| ${metric} | ${value} |`).join('\n');

  return `## Overview

| Metric | Value |
|--------|-------|
${tableRows}`;
}

function countTopics(nodes: TopicHierarchyNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (node.children?.length) {
      count += countTopics(node.children);
    }
  }
  return count;
}

function generateTopicHierarchySection(
  dataset: Dataset,
  records: DatasetRecord[]
): string | null {
  const hierarchy = dataset.topicHierarchy?.hierarchy;
  if (!hierarchy || hierarchy.length === 0) {
    return null;
  }

  const recordsByTopic = countRecordsByTopic(records);
  const tree = formatTopicTree(hierarchy, recordsByTopic);

  return `## Topic Hierarchy

\`\`\`
${dataset.name}
${tree}\`\`\``;
}

function generateCoverageSection(
  dataset: Dataset,
  records: DatasetRecord[]
): string | null {
  const stats = dataset.coverageStats;
  if (!stats || Object.keys(stats.topicDistribution).length === 0) {
    return null;
  }

  const totalRecords = records.length;
  const topicRows = Object.entries(stats.topicDistribution)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, count]) => {
      const pct = totalRecords > 0 ? (count / totalRecords) * 100 : 0;
      const status = getCoverageStatus(pct, count);
      const displayTopic = topic === '__unassigned__' ? '_Unassigned_' : topic;
      return `| ${displayTopic} | ${count} | ${pct.toFixed(0)}% | ${status} |`;
    })
    .join('\n');

  const balanceDesc = getBalanceDescription(stats.balanceRating);

  return `## Coverage Analysis

| Topic | Records | Coverage | Status |
|-------|---------|----------|--------|
${topicRows}

**Balance Score:** ${stats.balanceScore?.toFixed(2) || 'N/A'} (${balanceDesc})`;
}

function generateQualitySection(dryRunStats: DryRunStats): string {
  const { statistics, distribution, diagnosis, samplesEvaluated } = dryRunStats;

  const verdictEmoji =
    diagnosis.verdict === 'GO' ? '✅' : diagnosis.verdict === 'WARNING' ? '⚠️' : '❌';

  let section = `## Quality Metrics

*Last evaluated: ${formatDate(dryRunStats.lastRunAt)}*

### Summary

| Metric | Value |
|--------|-------|
| Samples Evaluated | ${samplesEvaluated} |
| Average Score | ${statistics.mean.toFixed(3)} |
| Median Score | ${statistics.median.toFixed(3)} |
| Std Deviation | ${statistics.std.toFixed(3)} |
| Pass Rate (>0) | ${(statistics.percentAboveZero * 100).toFixed(0)}% |
| Perfect Score (=1) | ${(statistics.percentPerfect * 100).toFixed(0)}% |
| Verdict | ${verdictEmoji} ${diagnosis.verdict} |

### Score Distribution

\`\`\`
${formatScoreDistribution(distribution)}
\`\`\``;

  if (diagnosis.warnings.length > 0) {
    section += `

### Warnings

${diagnosis.warnings.map((w) => `- ⚠️ ${w}`).join('\n')}`;
  }

  if (diagnosis.recommendations.length > 0) {
    section += `

### Recommendations

${diagnosis.recommendations.map((r) => `- ${r}`).join('\n')}`;
  }

  return section;
}

function generateWorkflowSection(workflow: FinetuneWorkflowState): string | null {
  // Don't show workflow section if no progress has been made
  // (workflow not started and no real steps have progressed)
  // Note: 'not_started' step is initialized as 'completed', so we exclude it from the check
  const realSteps: FinetuneStep[] = ['topics_config', 'categorize', 'coverage_generation', 'grader_config', 'dry_run', 'training', 'deployment'];
  const hasAnyProgress = workflow.currentStep !== 'not_started' ||
    realSteps.some((step) => workflow.stepStatus[step] !== 'pending');

  if (!hasAnyProgress) {
    return null;
  }

  const steps: Array<{ name: string; step: FinetuneStep; details?: string }> = [
    { name: 'Topics Configuration', step: 'topics_config' },
    { name: 'Record Categorization', step: 'categorize' },
    { name: 'Coverage Generation', step: 'coverage_generation' },
    { name: 'Grader Configuration', step: 'grader_config' },
    { name: 'Dry Run', step: 'dry_run' },
    { name: 'Training', step: 'training' },
    { name: 'Deployment', step: 'deployment' },
  ];

  // Add details for completed steps
  if (workflow.topicsConfig) {
    const topicStep = steps.find((s) => s.step === 'topics_config');
    if (topicStep) {
      topicStep.details = `${workflow.topicsConfig.topicCount} topics, depth ${workflow.topicsConfig.depth}`;
    }
  }

  if (workflow.categorization) {
    const catStep = steps.find((s) => s.step === 'categorize');
    if (catStep) {
      catStep.details = `${workflow.categorization.assignedCount} assigned`;
    }
  }

  if (workflow.coverageGeneration) {
    const covStep = steps.find((s) => s.step === 'coverage_generation');
    if (covStep) {
      const rounds = workflow.coverageGeneration.generationRounds?.length || 0;
      covStep.details = `${rounds} generation rounds`;
    }
  }

  const rows = steps
    .map((s) => {
      const status = workflow.stepStatus[s.step] || 'pending';
      const isCurrent = workflow.currentStep === s.step;
      const indicator = getStepIndicator(status, isCurrent);
      const details = s.details || '-';
      return `| ${s.name} | ${indicator} | ${details} |`;
    })
    .join('\n');

  return `## Workflow Status

**Current Step:** \`${workflow.currentStep}\`

| Step | Status | Details |
|------|--------|---------|
${rows}`;
}

function generateGenerationHistorySection(
  workflow: FinetuneWorkflowState | null | undefined
): string | null {
  const rounds = workflow?.coverageGeneration?.generationRounds;
  if (!rounds || rounds.length === 0) {
    return null;
  }

  const rows = rounds
    .slice()
    .reverse()
    .slice(0, 10) // Show last 10 rounds
    .map((round) => {
      const date = formatDate(round.timestamp);
      const topics =
        round.topicsTargeted.length > 2
          ? `${round.topicsTargeted.slice(0, 2).join(', ')}...`
          : round.topicsTargeted.join(', ') || 'Various';
      return `| ${date} | ${round.strategy} | +${round.recordsGenerated} | ${topics} |`;
    })
    .join('\n');

  return `## Generation History

| Date | Strategy | Records | Topics |
|------|----------|---------|--------|
${rows}`;
}

function generateKnowledgeSourcesSection(
  knowledgeSources?: KnowledgeSourceInfo[]
): string | null {
  if (!knowledgeSources || knowledgeSources.length === 0) {
    return null;
  }

  const rows = knowledgeSources.map((source) => {
    const topics = source.topics_extracted.length > 0
      ? source.topics_extracted.slice(0, 3).join(', ') + (source.topics_extracted.length > 3 ? '...' : '')
      : '_None extracted_';
    const size = source.size ? `${(source.size / 1024).toFixed(1)} KB` : '-';
    return `| ${source.name} | ${source.type} | ${size} | ${topics} |`;
  }).join('\n');

  return `## Data Sources

The following knowledge sources were used to generate the topic hierarchy and ground the training data:

| Document | Type | Size | Topics Extracted |
|----------|------|------|-----------------|
${rows}

Training data is grounded in these source materials to ensure accuracy and relevance.`;
}

function generateSetupPlanSection(
  summary?: SetupPlanSummary
): string | null {
  if (!summary) {
    return null;
  }

  const date = formatDate(summary.executed_at);

  return `## Setup Plan Execution

*Executed: ${date}*

| Step | Result |
|------|--------|
| Topics Created | ${summary.topics_created} |
| Records Generated | ${summary.records_generated} |
| Evaluator Configured | ${summary.grader_configured ? '✓ Yes' : '○ No'} |
| Dry Run | ${summary.dry_run_completed ? '✓ Completed' : '○ Not run'} |

Records were generated with topics pre-assigned based on the topic hierarchy structure. Each topic received a proportional distribution of training examples.`;
}

function generateConfigSection(
  dataset: Dataset,
  _workflow: FinetuneWorkflowState | null | undefined
): string {
  const config: Record<string, unknown> = {};

  if (dataset.evalScript) {
    config.grader = {
      configured: true,
      scriptLength: dataset.evalScript.length,
    };
  }

  if (dataset.trainingConfig) {
    config.training = dataset.trainingConfig;
  }

  if (Object.keys(config).length === 0) {
    return '';
  }

  return `## Configuration

\`\`\`json
${JSON.stringify(config, null, 2)}
\`\`\``;
}

function generateFooter(): string {
  const now = new Date().toISOString();
  return `---
*Generated by Lucy Finetune | Last updated: ${now}*`;
}

// =============================================================================
// Main Generator
// =============================================================================

/**
 * Generate a README markdown string for a dataset
 */
export function generateDatasetReadme(options: ReadmeGeneratorOptions): string {
  const { dataset, records, workflow, knowledgeSources, setupPlanSummary } = options;

  const sections: (string | null)[] = [
    generateHeaderSection(dataset),
    generateOverviewSection(dataset, records),
    // Data provenance: where the data came from
    generateKnowledgeSourcesSection(knowledgeSources),
    // Setup plan execution summary (if applicable)
    generateSetupPlanSection(setupPlanSummary),
    // Dataset structure
    generateTopicHierarchySection(dataset, records),
    generateCoverageSection(dataset, records),
    // Quality metrics
    dataset.dryRunStats ? generateQualitySection(dataset.dryRunStats) : null,
    // Workflow status
    workflow ? generateWorkflowSection(workflow) : null,
    generateGenerationHistorySection(workflow),
    // Configuration
    generateConfigSection(dataset, workflow),
    generateFooter(),
  ];

  return sections.filter(Boolean).join('\n\n');
}

/**
 * Export README as a downloadable file
 */
export function exportDatasetReadme(dataset: Dataset): void {
  if (!dataset.readme) {
    console.warn('No README content to export');
    return;
  }

  const blob = new Blob([dataset.readme], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${dataset.name.replace(/\s+/g, '-')}-README.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
