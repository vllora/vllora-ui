/**
 * Get Workflow State Tool
 *
 * Merged tool that combines data content stats (from get_dataset_stats)
 * with pipeline execution state (from get_dataset_execution_state).
 * Gives every consumer the full picture in one call.
 */

import type { DistriFnTool } from '@distri/core';
import { datasetService, recordService, knowledgeSourceService, workflowService } from '@/services/service-registry';
import { countLeafTopics } from './helpers';
import type { ToolHandler } from '../types';
import type { DatasetStats, SanitizationStats, DatasetRecord } from '@/types/dataset-types';
import { sanitizeRecords, DEFAULT_VALIDATION_CONFIG } from '@/components/datasets/sanitization-utils';
import { getStoredPlan } from './proposed-plan-store';
import { STEP_ORDER } from './execute-plan';

const EXECUTION_STEP_SET = new Set<string>(STEP_ORDER);

function normalizePlanStepIds(stepIds?: readonly string[] | null): string[] {
  if (stepIds == null) {
    return [...STEP_ORDER];
  }

  const normalized: string[] = [];
  for (const stepId of stepIds) {
    if (EXECUTION_STEP_SET.has(stepId) && !normalized.includes(stepId)) {
      normalized.push(stepId);
    }
  }
  return normalized;
}

// =============================================================================
// Types
// =============================================================================

export interface DatasetState {
  workflow_id: string;

  // Data content (from get_dataset_stats)
  records: {
    total_count: number;
    generated_count: number;
    original_count: number;
    total_messages: number;
    avg_messages_per_record: number;
    uncategorized_count: number;
  };
  topics: {
    configured: boolean;
    leaf_count: number;
    top_level_names: string[];
    distribution: Record<string, number>;
  };
  sanitization: {
    valid_records: number;
    invalid_records: number;
    duplicate_records: number;
    validation_rate: number;
    errors_by_type: Record<string, number>;
    recommendations: string[];
  };

  // Pipeline status (from get_dataset_execution_state)
  grader: {
    configured: boolean;
  };
  upload: {
    uploaded: boolean;
    backend_workflow_id: string | null;
  };
  dry_run: {
    completed: boolean;
    verdict: string | null;
    percent_above_zero: number | null;
  };
  training: {
    has_job: boolean;
    job_id: string | null;
    status: string | null;
  };

  // Knowledge sources
  knowledge_sources: {
    total_count: number;
    ready_count: number;
    processing_count: number;
  };

  // Plan execution state (tells the agent whether an existing plan exists)
  plan: {
    exists: boolean;
    status: string | null;
    completed_steps: string[];
    failed_step: string | null;
    remaining_steps: string[];
  };
}

// =============================================================================
// Internal helpers (stats computation)
// =============================================================================

/**
 * Run sanitization on records and return stats.
 */
async function computeSanitizationStats(records: DatasetRecord[]): Promise<SanitizationStats> {
  if (records.length === 0) {
    return {
      validRecords: 0,
      invalidRecords: 0,
      duplicateRecords: 0,
      validationRate: 0,
      errorsByType: {},
      recommendations: [],
    };
  }

  const result = await sanitizeRecords(records, DEFAULT_VALIDATION_CONFIG);

  return {
    validRecords: result.report.valid,
    invalidRecords: result.report.rejected,
    duplicateRecords: result.report.duplicatesRemoved,
    validationRate: result.report.valid / result.report.total,
    errorsByType: result.report.errorsByType as Record<string, number>,
    recommendations: result.report.recommendations,
  };
}

/**
 * Compute dataset statistics from records and dataset.
 * Separated for reuse by other tools/components.
 */
export async function computeDatasetStats(
  records: DatasetRecord[],
  dataset: { topicHierarchy?: unknown; evalScript?: string } | null
): Promise<DatasetStats> {
  const byTopic: Record<string, number> = {};
  let generatedCount = 0;
  let totalMessages = 0;
  let uncategorizedCount = 0;

  for (const record of records) {
    const topic = record.topic;
    if (topic) {
      byTopic[topic] = (byTopic[topic] || 0) + 1;
    } else {
      uncategorizedCount++;
    }
    if (record.is_generated) generatedCount++;
    const data = record.data as { input?: { messages?: unknown[] } } | null;
    totalMessages += data?.input?.messages?.length || 0;
  }

  // Run sanitization
  const sanitization = await computeSanitizationStats(records);

  return {
    totalRecords: records.length,
    generatedRecords: generatedCount,
    originalRecords: records.length - generatedCount,
    totalMessages,
    averageMessagesPerRecord: records.length > 0 ? Math.round((totalMessages / records.length) * 100) / 100 : 0,
    topicDistribution: byTopic,
    topicCount: Object.keys(byTopic).length,
    uncategorizedCount,
    hasTopicHierarchy: !!dataset?.topicHierarchy,
    hasEvalScript: !!dataset?.evalScript,
    sanitization,
    lastCalculatedAt: Date.now(),
  };
}

// =============================================================================
// Handler
// =============================================================================

export const getDatasetStateHandler: ToolHandler = async (params) => {
  const { workflow_id, persist = true } = params;

  if (!workflow_id || typeof workflow_id !== 'string') {
    return { success: false, error: 'workflow_id is required' };
  }

  try {
    // Retry once after a short delay if the dataset is not found.
    // This handles the race where the agent calls get_workflow_state
    // immediately after creating an experiment (IndexedDB write may
    // not have committed yet).
    let dataset = await datasetService.getById(workflow_id);
    if (!dataset) {
      await new Promise(resolve => setTimeout(resolve, 500));
      dataset = await datasetService.getById(workflow_id);
    }
    if (!dataset) {
      return { success: false, error: `Dataset ${workflow_id} not found. It may still be initializing — try again in a moment.` };
    }

    // Fetch records, workflow, plan state, and knowledge sources in parallel
    const [records, workflow, storedPlan, knowledgeSources] = await Promise.all([
      recordService.getByDatasetId(workflow_id),
      workflowService.getByDataset(workflow_id),
      getStoredPlan(workflow_id).catch(() => null),
      knowledgeSourceService.getByDataset(workflow_id).catch(() => [] as Awaited<ReturnType<typeof knowledgeSourceService.getByDataset>>),
    ]);

    // Compute stats (includes sanitization)
    const stats = await computeDatasetStats(records, dataset);

    // Persist stats to dataset if requested (default: true)
    if (persist && dataset) {
      await datasetService.updateDatasetStats(workflow_id, stats);
    }

    // Build topic info from hierarchy
    const hierarchy = dataset.topicHierarchy?.hierarchy;
    const leafCount = hierarchy ? countLeafTopics(hierarchy) : 0;
    const topLevelNames = hierarchy?.map((n) => n.name) || [];

    const state: DatasetState = {
      workflow_id,

      // Data content
      records: {
        total_count: stats.totalRecords,
        generated_count: stats.generatedRecords,
        original_count: stats.originalRecords,
        total_messages: stats.totalMessages,
        avg_messages_per_record: stats.averageMessagesPerRecord,
        uncategorized_count: stats.uncategorizedCount,
      },
      topics: {
        configured: leafCount > 0,
        leaf_count: leafCount,
        top_level_names: topLevelNames,
        distribution: stats.topicDistribution,
      },
      sanitization: {
        valid_records: stats.sanitization?.validRecords ?? 0,
        invalid_records: stats.sanitization?.invalidRecords ?? 0,
        duplicate_records: stats.sanitization?.duplicateRecords ?? 0,
        validation_rate: stats.sanitization?.validationRate ?? 0,
        errors_by_type: stats.sanitization?.errorsByType ?? {},
        recommendations: stats.sanitization?.recommendations ?? [],
      },

      // Knowledge sources
      knowledge_sources: {
        total_count: knowledgeSources.length,
        ready_count: knowledgeSources.filter(s => s.status === 'ready').length,
        processing_count: knowledgeSources.filter(s => s.status === 'processing').length,
      },

      // Pipeline status
      grader: {
        configured: !!dataset.evalScript,
      },
      upload: {
        uploaded: true,
        backend_workflow_id: dataset.id,
      },
      dry_run: {
        completed: !!workflow?.dryRun?.verdict,
        verdict: workflow?.dryRun?.verdict || null,
        percent_above_zero: workflow?.dryRun?.percentAboveZero ?? null,
      },
      training: {
        has_job: !!workflow?.training?.jobId,
        job_id: workflow?.training?.jobId || null,
        status: workflow?.training?.status || null,
      },

      // Plan execution state
      plan: (() => {
        if (!storedPlan) {
          return { exists: false, status: null, completed_steps: [], failed_step: null, remaining_steps: [] };
        }
        const completedSteps = normalizePlanStepIds(
          storedPlan.executionProgress?.steps
          .filter(s => s.status === 'completed')
          .map(s => s.id) ?? []
        );
        const failedStepRaw = storedPlan.executionProgress?.steps
          .find(s => s.status === 'failed')?.id ?? null;
        const failedStep = failedStepRaw && EXECUTION_STEP_SET.has(failedStepRaw)
          ? failedStepRaw
          : null;
        const allPlannedSteps = normalizePlanStepIds(
          (storedPlan.plan?.steps_to_execute as unknown as string[] | undefined) ?? STEP_ORDER
        );
        const remainingSteps = allPlannedSteps
          .filter(id => !completedSteps.includes(id));
        return {
          exists: true,
          status: storedPlan.status,
          completed_steps: completedSteps,
          failed_step: failedStep,
          remaining_steps: remainingSteps,
        };
      })(),
    };

    return { success: true, state };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get dataset state',
    };
  }
};

// =============================================================================
// Tool Definition
// =============================================================================

export const getDatasetStateTool: DistriFnTool = {
  name: 'get_workflow_state',
  description: `Get a comprehensive snapshot of the current dataset: content stats + pipeline status + plan state.

Returns:
- records: total/generated/original counts, messages, uncategorized
- topics: configured? leaf count, top-level names, distribution
- sanitization: valid/invalid/duplicate counts, validation rate, errors, recommendations
- knowledge_sources: total_count, ready_count, processing_count
- grader: evaluator configured?
- upload: uploaded to backend?
- dry_run: completed? verdict?
- training: job exists? status?
- plan: exists? status? completed_steps, failed_step, remaining_steps

IMPORTANT: If plan.exists is true and plan.status is 'failed' or 'executing',
do NOT create a new plan. Resume the existing plan by calling execute_plan
with steps_to_execute set to plan.remaining_steps.

ALWAYS call this before execute_plan when resuming an interrupted execution.
Compare the returned state against the plan to decide which steps still need to run.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The dataset ID',
      },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await getDatasetStateHandler(input as Record<string, unknown>)),
} as DistriFnTool;
