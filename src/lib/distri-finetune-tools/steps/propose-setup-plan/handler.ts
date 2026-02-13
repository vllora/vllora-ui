/**
 * Propose Setup Plan Handler
 *
 * Validates, persists, and emits a plan for user approval.
 * This tool is intentionally "dumb" — Lucy constructs the plan,
 * this handler just shows it to the user.
 */

import * as datasetsDB from '@/services/datasets-db';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../../types';
import type {
  ProposeSetupPlanParams,
  ProposedTopic,
  SetupPlan,
  ProposeSetupPlanResult,
} from './types';
import { saveProposedPlan } from '../proposed-plan-store';
import { generateGraderTemplate } from './grader-template';

// =============================================================================
// Plan normalization helpers (compensate for LLM imprecision)
// =============================================================================

const DEFAULT_RECORD_COUNT = 30;

/** Count leaf topics (topics without children) */
function countLeafs(topics: ProposedTopic[]): number {
  return topics.reduce((acc, t) => {
    if (t.subtopics && t.subtopics.length > 0) {
      return acc + countLeafs(t.subtopics);
    }
    return acc + 1;
  }, 0);
}

/** Ensure leaf topics have target_count and parent topics have 0 */
function normalizeTargetCounts(topics: ProposedTopic[]): ProposedTopic[] {
  return topics.map((t) => {
    if (t.subtopics && t.subtopics.length > 0) {
      return { ...t, target_count: 0, subtopics: normalizeTargetCounts(t.subtopics) };
    }
    return { ...t, target_count: t.target_count || DEFAULT_RECORD_COUNT };
  });
}

/** Validate output_format — if output_schema is invalid JSON, clear it */
function validateOutputFormat(plan: SetupPlan): void {
  if (!plan.output_format) return;
  const schema = plan.output_format.schema;
  if (!schema || Object.keys(schema).length === 0) {
    plan.output_format = null;
    return;
  }
  if (!plan.output_format.system_prompt_template?.trim()) {
    console.log('[proposeSetupPlan] output_format.schema present but system_prompt_template missing, clearing');
    plan.output_format = null;
  }
}

// =============================================================================
// Handler
// =============================================================================

export const proposeSetupPlanHandler: ToolHandler = async (
  params
): Promise<ProposeSetupPlanResult> => {
  try {
    console.log('[proposeSetupPlan] Starting with params:', JSON.stringify(params, null, 2));

    const { dataset_id, plan: agentPlan } = params as unknown as ProposeSetupPlanParams;

    if (!dataset_id) {
      return { success: false, error: 'dataset_id is required' };
    }

    if (!agentPlan) {
      return {
        success: false,
        error: 'plan is required. Use analyze_knowledge_sources first to get recommendations, then construct a plan and pass it here.',
      };
    }

    // Show loading state in UI
    emitter.emit('vllora_setup_plan_generating', { datasetId: dataset_id });

    // Validate dataset exists
    const dataset = await datasetsDB.getDatasetById(dataset_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${dataset_id} not found` };
    }

    // Fill in defaults from dataset
    const plan: SetupPlan = {
      ...agentPlan,
      dataset_id,
      dataset_name: agentPlan.dataset_name || dataset.name,
      objective: agentPlan.objective || dataset.datasetObjective || '',
    };

    // --- Normalize topics (LLMs often get counts wrong) ---
    if (plan.proposed_topics?.length) {
      plan.proposed_topics = normalizeTargetCounts(plan.proposed_topics);
      const leafCount = countLeafs(plan.proposed_topics);
      plan.total_topic_count = leafCount;

      // Recalculate estimated_records from actual target_counts
      const calcRecords = (topics: ProposedTopic[]): number =>
        topics.reduce((sum, t) => {
          const childSum = t.subtopics?.length ? calcRecords(t.subtopics) : 0;
          return sum + t.target_count + childSum;
        }, 0);
      plan.estimated_records = calcRecords(plan.proposed_topics);
    }

    // --- Validate output_format ---
    validateOutputFormat(plan);

    // --- Always regenerate grader template_preview from criteria ---
    // Criteria are the source of truth; template is derived from them.
    // This ensures the JS evaluator matches the plan's output_format.
    if (plan.grader_config?.criteria?.length) {
      plan.grader_config.template_preview = generateGraderTemplate(
        plan.grader_config.criteria,
        plan.objective,
        plan.output_format,
      );
    }

    // --- Default execution_steps if missing ---
    if (!plan.execution_steps?.length) {
      plan.execution_steps = (plan.steps_to_execute ?? []).map((id) => ({
        step: id,
        description: id,
        estimated_time: '~1 min',
      }));
    }

    // Persist to IndexedDB so it survives page refresh
    await saveProposedPlan(dataset_id, plan);

    // Emit event so the UI can display the plan card
    emitter.emit('vllora_setup_plan_proposed', { datasetId: dataset_id, plan });

    console.log('[proposeSetupPlan] Plan persisted and emitted');
    return { success: true, plan };
  } catch (error) {
    console.error('[proposeSetupPlan] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to propose setup plan',
    };
  }
};
