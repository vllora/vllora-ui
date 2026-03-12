/**
 * Propose plan Handler
 *
 * Validates, persists, and emits a plan for user approval.
 * This tool is intentionally "dumb" — Lucy constructs the plan,
 * this handler just shows it to the user.
 */

import { datasetService } from '@/services/service-registry';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../../types';
import type {
  ProposePlanParams,
  ProposedTopic,
  Plan,
  ProposePlanResult,
} from './types';
import { saveProposedPlan } from '../proposed-plan-store';
import { normalizePlanSteps } from '../plan-step-normalization';

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

/** Sum all leaf target_counts in a topic tree */
function sumTargetCounts(topics: ProposedTopic[]): number {
  return topics.reduce((sum, t) => {
    if (t.subtopics && t.subtopics.length > 0) {
      return sum + sumTargetCounts(t.subtopics);
    }
    return sum + t.target_count;
  }, 0);
}

/**
 * Redistribute leaf target_counts so they sum to `desiredTotal`.
 * Divides evenly across leaves; distributes remainder one-per-leaf.
 * Returns a new tree (immutable).
 */
function redistributeTargetCounts(topics: ProposedTopic[], desiredTotal: number): ProposedTopic[] {
  const leafCount = countLeafs(topics);
  if (leafCount === 0 || desiredTotal <= 0) return topics;

  const perTopic = Math.floor(desiredTotal / leafCount);
  const extraCount = desiredTotal - perTopic * leafCount;
  let leafIndex = 0;

  const rebuild = (ts: ProposedTopic[]): ProposedTopic[] =>
    ts.map((t) => {
      if (t.subtopics && t.subtopics.length > 0) {
        return { ...t, target_count: 0, subtopics: rebuild(t.subtopics) };
      }
      const idx = leafIndex++;
      return { ...t, target_count: perTopic + (idx < extraCount ? 1 : 0) };
    });

  return rebuild(topics);
}

/** Validate output_format — if output_schema is invalid JSON, clear it */
function validateOutputFormat(plan: Plan): void {
  if (!plan.output_format) return;
  const schema = plan.output_format.schema;
  if (!schema || Object.keys(schema).length === 0) {
    plan.output_format = null;
    return;
  }
  if (!plan.output_format.system_prompt_template?.trim()) {
    console.log('[proposePlan] output_format.schema present but system_prompt_template missing, clearing');
    plan.output_format = null;
  }
}

// =============================================================================
// Handler
// =============================================================================

export const proposePlanHandler: ToolHandler = async (
  params
): Promise<ProposePlanResult> => {
  try {
    console.log('[proposePlan] Starting with params:', JSON.stringify(params, null, 2));

    const { workflow_id, plan: agentPlan } = params as unknown as ProposePlanParams;

    if (!workflow_id) {
      return { success: false, error: 'workflow_id is required' };
    }

    if (!agentPlan) {
      return {
        success: false,
        error: 'plan is required. Use analyze_knowledge_sources first to get recommendations, then construct a plan and pass it here.',
      };
    }

    // Show loading state in UI
    emitter.emit('vllora_plan_generating', { workflowId: workflow_id });

    // Validate dataset exists
    const dataset = await datasetService.getById(workflow_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${workflow_id} not found` };
    }

    // Fill in defaults from dataset
    const plan: Plan = {
      ...agentPlan,
      workflow_id,
      dataset_name: agentPlan.dataset_name || dataset.name,
      objective: agentPlan.objective || dataset.datasetObjective || '',
    };

    // Auto-rename dataset to the plan's clean display name
    if (plan.dataset_name && plan.dataset_name !== dataset.name) {
      await datasetService.rename(workflow_id, plan.dataset_name);
      emitter.emit('vllora_dataset_refresh' as any);
    }

    // plan_markdown is required — the agent must provide the full markdown
    if (!plan.plan_markdown?.trim()) {
      return {
        success: false,
        error: 'plan_markdown is required. Write the full plan as markdown with a checklist (- [ ] Step 1, etc.).',
      };
    }

    // --- Normalize finetune data fields if present ---

    // Normalize topics (LLMs often get counts wrong)
    if (plan.proposed_topics?.length) {
      plan.proposed_topics = normalizeTargetCounts(plan.proposed_topics);
      const leafCount = countLeafs(plan.proposed_topics);
      plan.total_topic_count = leafCount;

      // If agent specified a desired total (estimated_records) that differs from
      // the sum of per-topic target_counts, redistribute evenly across leaves.
      // This handles cases where the user edits the total record count in the plan
      // but the agent doesn't update individual topic counts to match.
      const desiredTotal = agentPlan.estimated_records;
      const actualSum = sumTargetCounts(plan.proposed_topics);

      if (desiredTotal && desiredTotal > 0 && desiredTotal !== actualSum) {
        console.log(
          `[proposePlan] Redistributing target_counts: desired=${desiredTotal}, actual sum=${actualSum}, leaves=${leafCount}`
        );
        plan.proposed_topics = redistributeTargetCounts(plan.proposed_topics, desiredTotal);
      }

      // Recalculate estimated_records from actual target_counts (single source of truth)
      plan.estimated_records = sumTargetCounts(plan.proposed_topics);
    }

    // Validate output_format
    validateOutputFormat(plan);

    // Normalize execution step IDs if provided (backward compat)
    if (plan.steps_to_execute?.length) {
      const rawSteps = plan.steps_to_execute as unknown as string[];
      const stepNormalization = normalizePlanSteps(rawSteps, { fallbackToDefaultWhenEmpty: true });
      if (stepNormalization.hadInput) {
        if (stepNormalization.strippedLegacySteps.length > 0) {
          console.log(
            `[proposePlan] Stripped legacy steps: ${stepNormalization.strippedLegacySteps.join(', ')}`
          );
        }
        if (stepNormalization.unknownSteps.length > 0) {
          console.warn(
            `[proposePlan] Removed unknown step IDs: ${stepNormalization.unknownSteps.join(', ')}`
          );
        }
        plan.steps_to_execute = stepNormalization.steps as unknown as Plan['steps_to_execute'];
      }
    }

    // Persist to IndexedDB so it survives page refresh
    await saveProposedPlan(workflow_id, plan);

    // Emit event so the UI can display the plan card
    emitter.emit('vllora_plan_proposed', { workflowId: workflow_id, plan });

    console.log('[proposePlan] Plan persisted and emitted');
    return { success: true, plan };
  } catch (error) {
    console.error('[proposePlan] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to propose plan',
    };
  }
};
