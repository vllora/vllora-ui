/**
 * Get Evaluation Details Tool
 *
 * Retrieves detailed evaluation results including per-record scores,
 * grader reasoning, and per-topic breakdown. Enables Lucy to analyze WHY
 * records scored poorly and make informed decisions about iteration.
 *
 * Data sources:
 * - EvalJob.pollingSnapshot (EvaluationResultResponse) for per-row results
 * - DatasetRecord.topic for topic mapping
 * - flattenEvaluationResults() for normalized row data
 */

import type { DistriFnTool } from '@distri/core';
import { evalJobService, recordService } from '@/services/service-registry';
import { flattenEvaluationResults } from '@/services/finetune-api';
import type { FlatEvaluationResult } from '@/services/finetune-api';
import type { ToolHandler } from '../types';

// =============================================================================
// Types
// =============================================================================

interface TopicBreakdown {
  topic: string;
  recordCount: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
  passCount: number;
  failCount: number;
}

interface RecordDetail {
  recordId: string;
  rowIndex: number;
  topic: string;
  score: number;
  reason: string;
  status: string;
}

// =============================================================================
// Handler
// =============================================================================

export const getEvaluationDetailsHandler: ToolHandler = async (params) => {
  try {
    const {
      workflow_id,
      evaluation_id,
      sort_by = 'score_asc',
      limit = 20,
      topic_filter,
    } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    // Find the target evaluation job
    const jobs = await evalJobService.getByDataset(workflow_id);
    const targetJob = evaluation_id
      ? jobs.find((j) => j.id === evaluation_id || j.evaluationRunId === evaluation_id)
      : jobs.find((j) => j.status === 'completed');

    if (!targetJob) {
      return { success: false, error: 'No completed evaluation found for this dataset' };
    }

    if (!targetJob.pollingSnapshot?.results) {
      return {
        success: false,
        error: 'Evaluation has no detailed results. It may still be running.',
      };
    }

    // Flatten epoch results into per-row data
    const flatResults = flattenEvaluationResults(targetJob.pollingSnapshot.results);

    // Load dataset records for topic mapping
    const records = await recordService.getAllRecordsPaginated(workflow_id);
    const recordTopicMap = new Map<string, string>();
    for (const record of records) {
      recordTopicMap.set(record.id, record.topic ?? 'Uncategorized');
    }

    // Map flat results to record details with topic info
    const recordDetails: RecordDetail[] = flatResults
      .filter((r) => r.status === 'completed' || r.score != null)
      .map((r) => mapToRecordDetail(r, recordTopicMap));

    // Apply topic filter
    const topicFilterStr = typeof topic_filter === 'string' ? topic_filter : undefined;
    const filtered = topicFilterStr
      ? recordDetails.filter((r) => r.topic.toLowerCase().includes(topicFilterStr.toLowerCase()))
      : recordDetails;

    // Compute per-topic breakdown
    const topicBreakdowns = computeTopicBreakdowns(filtered);

    // Sort records
    const sortKey = typeof sort_by === 'string' ? sort_by : 'score_asc';
    const sorted = sortRecordDetails(filtered, sortKey);

    // Apply limit
    const recordLimit = typeof limit === 'number' ? Math.min(limit, 100) : 20;
    const limitedRecords = sorted.slice(0, recordLimit);

    // Compute summary stats
    const scores = filtered.map((r) => r.score).filter((s): s is number => s != null);
    const mean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const std = scores.length > 1
      ? Math.sqrt(scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / (scores.length - 1))
      : 0;

    return {
      success: true,
      evaluation_id: targetJob.id,
      evaluation_run_id: targetJob.evaluationRunId,
      summary: {
        total_records: flatResults.length,
        scored_records: scores.length,
        mean_score: round(mean),
        std_score: round(std),
        min_score: scores.length > 0 ? round(Math.min(...scores)) : null,
        max_score: scores.length > 0 ? round(Math.max(...scores)) : null,
        pass_rate: scores.length > 0
          ? round(scores.filter((s) => s > 0).length / scores.length)
          : 0,
      },
      per_topic: topicBreakdowns.map((t) => ({
        topic: t.topic,
        record_count: t.recordCount,
        avg_score: round(t.avgScore),
        min_score: round(t.minScore),
        max_score: round(t.maxScore),
        pass_count: t.passCount,
        fail_count: t.failCount,
      })),
      worst_records: limitedRecords.map((r) => ({
        record_id: r.recordId,
        topic: r.topic,
        score: round(r.score),
        reason: r.reason,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get evaluation details',
    };
  }
};

// =============================================================================
// Helpers
// =============================================================================

function mapToRecordDetail(
  flat: FlatEvaluationResult,
  topicMap: Map<string, string>
): RecordDetail {
  const recordId = flat.row?.id ?? flat.dataset_row_id ?? `row-${flat.row_index}`;
  return {
    recordId,
    rowIndex: flat.row_index,
    topic: topicMap.get(recordId) ?? 'Uncategorized',
    score: flat.score ?? 0,
    reason: flat.reason ?? '',
    status: flat.status,
  };
}

function computeTopicBreakdowns(records: RecordDetail[]): TopicBreakdown[] {
  const byTopic = new Map<string, RecordDetail[]>();
  for (const r of records) {
    const existing = byTopic.get(r.topic) ?? [];
    byTopic.set(r.topic, [...existing, r]);
  }

  const breakdowns: TopicBreakdown[] = [];
  for (const [topic, topicRecords] of byTopic) {
    const scores = topicRecords.map((r) => r.score);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    breakdowns.push({
      topic,
      recordCount: topicRecords.length,
      avgScore: avg,
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
      passCount: scores.filter((s) => s > 0).length,
      failCount: scores.filter((s) => s <= 0).length,
    });
  }

  return breakdowns.sort((a, b) => a.avgScore - b.avgScore);
}

function sortRecordDetails(records: RecordDetail[], sortBy: string): RecordDetail[] {
  const sorted = [...records];
  switch (sortBy) {
    case 'score_asc':
      return sorted.sort((a, b) => a.score - b.score);
    case 'score_desc':
      return sorted.sort((a, b) => b.score - a.score);
    case 'topic':
      return sorted.sort((a, b) => a.topic.localeCompare(b.topic) || a.score - b.score);
    default:
      return sorted.sort((a, b) => a.score - b.score);
  }
}

function round(n: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

// =============================================================================
// Tool Definition
// =============================================================================

export const getEvaluationDetailsTool: DistriFnTool = {
  name: 'get_evaluation_details',
  description:
    'Retrieve detailed evaluation results including per-record scores, grader reasoning, and per-topic breakdown. Use this after an evaluation completes to understand WHY records scored poorly and which topics need improvement.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The dataset ID to get evaluation details for',
      },
      evaluation_id: {
        type: 'string',
        description:
          'Specific evaluation job ID. If omitted, uses the most recent completed evaluation.',
      },
      sort_by: {
        type: 'string',
        enum: ['score_asc', 'score_desc', 'topic'],
        description: 'How to sort the worst_records list. Default: score_asc (worst first)',
      },
      limit: {
        type: 'number',
        description: 'Max number of records to return in worst_records. Default: 20, max: 100',
      },
      topic_filter: {
        type: 'string',
        description: 'Filter results to a specific topic (case-insensitive substring match)',
      },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await getEvaluationDetailsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
