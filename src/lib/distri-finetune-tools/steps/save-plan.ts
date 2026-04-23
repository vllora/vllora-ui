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
  saveProposedPlan,
  savePreviousPlanSnapshot,
  getPreviousPlanSnapshot,
} from './proposed-plan-store';
import { diffPlans, type PlanDiff } from '@/components/datasets/plan-section/plan-markdown-utils';
import { normalizePlanSteps, areStepListsEqual } from './plan-step-normalization';
import { datasetService } from '@/services/service-registry';

// =============================================================================
// Types
// =============================================================================

interface SavePlanParams {
  workflow_id: string;
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

  // plan_markdown is required — the agent must provide the full markdown
  if (!plan.plan_markdown?.trim()) {
    errors.push('plan_markdown must not be empty');
  }

  // Validate steps_to_execute if present (optional — agent may drive execution directly)
  if (plan.steps_to_execute?.length) {
    const rawSteps = plan.steps_to_execute as unknown as string[];
    const stepNormalization = normalizePlanSteps(rawSteps);
    if (stepNormalization.unknownSteps.length > 0) {
      errors.push(`steps_to_execute contains unknown IDs: ${stepNormalization.unknownSteps.join(', ')}`);
    }
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
  const tp = (n: number) => n === 1 ? 'topic' : 'topics';
  const cp = (n: number) => n === 1 ? 'criterion' : 'criteria';
  if (diff.topicsAdded.length > 0) parts.push(`${diff.topicsAdded.length} ${tp(diff.topicsAdded.length)} added`);
  if (diff.topicsRemoved.length > 0) parts.push(`${diff.topicsRemoved.length} ${tp(diff.topicsRemoved.length)} removed`);
  if (diff.topicsModified.length > 0) parts.push(`${diff.topicsModified.length} ${tp(diff.topicsModified.length)} modified`);
  if (diff.criteriaAdded.length > 0) parts.push(`${diff.criteriaAdded.length} ${cp(diff.criteriaAdded.length)} added`);
  if (diff.criteriaRemoved.length > 0) parts.push(`${diff.criteriaRemoved.length} ${cp(diff.criteriaRemoved.length)} removed`);
  if (diff.criteriaModified.length > 0) parts.push(`${diff.criteriaModified.length} ${cp(diff.criteriaModified.length)} modified`);

  return parts.join(', ');
}

// =============================================================================
// Handler
// =============================================================================

export const savePlanHandler: ToolHandler = async (
  params
): Promise<SavePlanResult> => {
  try {
    const { workflow_id } = params as unknown as SavePlanParams;

    if (!workflow_id) {
      return { success: false, errors: ['workflow_id is required'] };
    }

    // 1. Read draft from store
    const stored = await getStoredPlan(workflow_id);
    if (!stored) {
      return {
        success: false,
        errors: ['No draft plan found. Call propose_plan or adjust_plan first.'],
      };
    }
    let draft = stored.plan;

    // Auto-fill objective and dataset_name from the dataset if not set on the plan.
    // Agents often set the objective via update_objective (on the dataset) but
    // forget to mirror it into the plan object — this prevents a validation loop.
    if (!draft.objective?.trim() || !draft.dataset_name?.trim()) {
      const dataset = await datasetService.getById(workflow_id);
      if (dataset) {
        let patched = false;
        if (!draft.objective?.trim() && dataset.datasetObjective?.trim()) {
          draft = { ...draft, objective: dataset.datasetObjective.trim() };
          patched = true;
        }
        if (!draft.dataset_name?.trim() && dataset.name?.trim()) {
          draft = { ...draft, dataset_name: dataset.name.trim() };
          patched = true;
        }
        if (patched) {
          await saveProposedPlan(workflow_id, draft);
        }
      }
    }

    // Normalize step IDs before validation (only if steps_to_execute is present)
    if (draft.steps_to_execute?.length) {
      const rawSteps = draft.steps_to_execute as unknown as string[];
      const stepNormalization = normalizePlanSteps(rawSteps, { fallbackToDefaultWhenEmpty: true });
      if (stepNormalization.hadInput) {
        const normalizedStepIds = stepNormalization.steps as unknown as string[];
        if (!areStepListsEqual(rawSteps, normalizedStepIds)) {
          draft = {
            ...draft,
            steps_to_execute: stepNormalization.steps as unknown as Plan['steps_to_execute'],
          };
          await saveProposedPlan(workflow_id, draft);
        }
      }
    }

    // 2. Validate
    const errors = validatePlan(draft);
    if (errors.length > 0) {
      console.warn('[savePlan] Validation failed:', errors);
      return { success: false, errors };
    }

    // 3. Compute diff vs previous snapshot
    const previous = await getPreviousPlanSnapshot(workflow_id);
    const diff = diffPlans(previous, draft);

    // 4. Save current draft as new snapshot (for future diffs)
    await savePreviousPlanSnapshot(workflow_id, draft);

    // 5. Emit event with diff payload so UI can show the diff banner
    emitter.emit('vllora_plan_proposed', {
      workflowId: workflow_id,
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
2. save_plan(workflow_id)
   - If errors: fix the plan and go back to step 1
   - If success: plan is committed and shown to user with diff summary
3. Wait for user to click "Approve & Execute" in the UI
4. execute_plan(workflow_id)

Returns:
- { success: false, errors: [...] }  → Lucy fixes proposal and retries step 1
- { success: true, diff_summary, topics_changed, criteria_changed }  → UI shows plan`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The dataset ID whose draft plan should be validated and committed',
      },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await savePlanHandler(input as Record<string, unknown>)),
} as DistriFnTool;
