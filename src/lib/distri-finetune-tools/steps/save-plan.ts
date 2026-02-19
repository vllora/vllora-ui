/**
 * Save Plan Tool
 *
 * Called by Lucy after propose_plan / adjust_plan.
 * Validates the draft plan, computes a diff against the previous plan,
 * commits it, and emits the UI event with diff payload.
 *
 * If validation fails, returns { success: false, errors } so Lucy can
 * fix the proposal and retry — no UI event fires until validation passes.
 */

import type { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';
import type { Plan } from './propose-plan/types';
import {
  getStoredPlan,
  savePreviousPlanSnapshot,
  getPreviousPlanSnapshot,
} from './proposed-plan-store';
import { diffPlans, type PlanDiff } from '@/components/datasets/plan-section/plan-markdown-utils';

// =============================================================================
// Types
// =============================================================================

interface SavePlanParams {
  dataset_id: string;
}

interface SavePlanResult {
  success: boolean;
  errors?: string[];
  diff_summary?: string;
  topics_changed?: number;
  criteria_changed?: number;
}

// =============================================================================
// Validation
// =============================================================================

function validatePlan(plan: Plan): string[] {
  const errors: string[] = [];

  if (!plan.objective?.trim()) {
    errors.push('objective must not be empty');
  }

  if (!plan.steps_to_execute?.length) {
    errors.push('steps_to_execute must not be empty');
  }

  if (!plan.execution_steps?.length) {
    errors.push('execution_steps must not be empty');
  }

  // Validate proposed_topics if present
  if (plan.proposed_topics !== undefined) {
    if (plan.proposed_topics.length === 0) {
      errors.push('proposed_topics must not be empty when present');
    } else {
      // All leaf topics must have target_count > 0
      const checkLeafs = (topics: typeof plan.proposed_topics): void => {
        if (!topics) return;
        for (const t of topics) {
          if (t.subtopics && t.subtopics.length > 0) {
            checkLeafs(t.subtopics);
          } else {
            if (!(t.target_count > 0)) {
              errors.push(`Leaf topic "${t.name}" must have target_count > 0`);
            }
          }
        }
      };
      checkLeafs(plan.proposed_topics);
    }
  }

  // Validate grader_config if present
  if (plan.grader_config !== undefined) {
    if (!plan.grader_config.criteria?.length) {
      errors.push('grader_config.criteria must not be empty when grader_config is present');
    } else {
      for (const c of plan.grader_config.criteria) {
        if (!c.name?.trim()) {
          errors.push('Each grader criterion must have a non-empty name');
        }
        if (!c.description?.trim()) {
          errors.push(`Grader criterion "${c.name || '(unnamed)'}" must have a non-empty description`);
        }
      }
    }
  }

  return errors;
}

// =============================================================================
// Diff Summary
// =============================================================================

function buildDiffSummary(diff: PlanDiff): string {
  if (!diff.hasChanges) return 'No changes from previous plan';

  const parts: string[] = [];
  if (diff.topicsAdded.length > 0) parts.push(`${diff.topicsAdded.length} topic(s) added`);
  if (diff.topicsRemoved.length > 0) parts.push(`${diff.topicsRemoved.length} topic(s) removed`);
  if (diff.topicsModified.length > 0) parts.push(`${diff.topicsModified.length} topic(s) modified`);
  if (diff.criteriaAdded.length > 0) parts.push(`${diff.criteriaAdded.length} criterion added`);
  if (diff.criteriaRemoved.length > 0) parts.push(`${diff.criteriaRemoved.length} criterion removed`);
  if (diff.criteriaModified.length > 0) parts.push(`${diff.criteriaModified.length} criterion modified`);

  return parts.join(', ');
}

// =============================================================================
// Handler
// =============================================================================

export const savePlanHandler: ToolHandler = async (
  params
): Promise<SavePlanResult> => {
  try {
    const { dataset_id } = params as unknown as SavePlanParams;

    if (!dataset_id) {
      return { success: false, errors: ['dataset_id is required'] };
    }

    // 1. Read draft from store
    const stored = await getStoredPlan(dataset_id);
    if (!stored) {
      return {
        success: false,
        errors: ['No draft plan found. Call propose_plan or adjust_plan first.'],
      };
    }
    const draft = stored.plan;

    // 2. Validate
    const errors = validatePlan(draft);
    if (errors.length > 0) {
      console.warn('[savePlan] Validation failed:', errors);
      return { success: false, errors };
    }

    // 3. Compute diff vs previous snapshot
    const previous = await getPreviousPlanSnapshot(dataset_id);
    const diff = diffPlans(previous, draft);

    // 4. Save current draft as new snapshot (for future diffs)
    await savePreviousPlanSnapshot(dataset_id, draft);

    // 5. Emit event with diff payload so UI can show the diff banner
    emitter.emit('vllora_plan_proposed', {
      datasetId: dataset_id,
      plan: draft,
      diff,
    });

    const diffSummary = buildDiffSummary(diff);
    const topicsChanged =
      diff.topicsAdded.length + diff.topicsRemoved.length + diff.topicsModified.length;
    const criteriaChanged =
      diff.criteriaAdded.length + diff.criteriaRemoved.length + diff.criteriaModified.length;

    console.log('[savePlan] Plan committed and emitted. Diff:', diffSummary);

    return {
      success: true,
      diff_summary: diffSummary,
      topics_changed: topicsChanged,
      criteria_changed: criteriaChanged,
    };
  } catch (error) {
    console.error('[savePlan] Failed:', error);
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Failed to save plan'],
    };
  }
};

// =============================================================================
// Tool Definition
// =============================================================================

export const savePlanTool: DistriFnTool = {
  name: 'save_plan',
  description: `Validate and commit a proposed or adjusted plan, then show it to the user.

Always call this AFTER propose_plan or adjust_plan.

Workflow:
1. propose_plan / adjust_plan  (saves draft)
2. save_plan(dataset_id)
   - If errors: fix the plan and go back to step 1
   - If success: plan is committed and shown to user with diff summary
3. Wait for user to click "Approve & Execute" in the UI
4. execute_plan(dataset_id)

Returns:
- { success: false, errors: [...] }  → Lucy fixes proposal and retries step 1
- { success: true, diff_summary, topics_changed, criteria_changed }  → UI shows plan`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID whose draft plan should be validated and committed',
      },
    },
    required: ['dataset_id'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await savePlanHandler(input as Record<string, unknown>)),
} as DistriFnTool;
