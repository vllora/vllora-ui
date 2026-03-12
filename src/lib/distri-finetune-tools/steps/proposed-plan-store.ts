/**
 * Proposed Plan Store
 *
 * In-memory plan store with lifecycle status tracking.
 * Plans are session-scoped — they don't survive page refresh,
 * which is fine because the agent session doesn't either.
 */

import type { Plan } from "./propose-plan";
import type { ExecutionProgress } from "./execute-plan";
import { normalizePlanSteps } from "./plan-step-normalization";

// =============================================================================
// Types
// =============================================================================

export type PlanStatus = 'proposed' | 'approved' | 'executing' | 'completed' | 'failed' | 'dismissed';

export interface StoredPlan {
  workflowId: string;
  plan: Plan;
  status: PlanStatus;
  executionProgress: ExecutionProgress | null;
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// In-memory store
// =============================================================================

const planStore = new Map<string, StoredPlan>();
const SNAPSHOT_KEY_PREFIX = 'previous:';

// =============================================================================
// Helpers
// =============================================================================

function normalizePlan(plan: Plan): Plan {
  const rawSteps = Array.isArray(plan.steps_to_execute)
    ? (plan.steps_to_execute as unknown as string[])
    : undefined;
  const stepNormalization = normalizePlanSteps(rawSteps, { fallbackToDefaultWhenEmpty: true });

  const normalized: Plan = stepNormalization.hadInput
    ? {
        ...plan,
        steps_to_execute: stepNormalization.steps as unknown as Plan["steps_to_execute"],
      }
    : plan;

  // Generate fallback plan_markdown if missing
  if (!normalized.plan_markdown) {
    const title = normalized.title || normalized.dataset_name || 'Plan';
    const objective = normalized.objective ? `> ${normalized.objective}\n\n` : '';
    const steps = (normalized.execution_steps ?? [])
      .map(s => `- [ ] ${s.step}`)
      .join('\n');
    normalized.plan_markdown = `# ${title}\n\n${objective}${steps || '_No steps configured_'}`;
  }

  return normalized;
}

// =============================================================================
// Core CRUD
// =============================================================================

/**
 * Save a proposed plan (status: 'proposed')
 */
export async function saveProposedPlan(
  workflowId: string,
  plan: Plan,
): Promise<void> {
  const stored: StoredPlan = {
    workflowId,
    plan: normalizePlan(plan),
    status: 'proposed',
    executionProgress: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  planStore.set(workflowId, stored);
}

/**
 * Get the full stored plan record (includes status + execution progress)
 */
export async function getStoredPlan(
  workflowId: string,
): Promise<StoredPlan | null> {
  return planStore.get(workflowId) ?? null;
}

/**
 * Get the proposed plan (returns just the plan data)
 */
export async function getProposedPlan(
  workflowId: string,
): Promise<Plan | null> {
  const stored = planStore.get(workflowId);
  return stored?.plan ?? null;
}

/**
 * Update the status of a stored plan
 */
export async function updatePlanStatus(
  workflowId: string,
  status: PlanStatus,
): Promise<void> {
  const stored = planStore.get(workflowId);
  if (!stored) return;

  planStore.set(workflowId, {
    ...stored,
    status,
    updatedAt: Date.now(),
  });
}

/**
 * Update execution progress and set status to 'executing'
 */
export async function updatePlanExecution(
  workflowId: string,
  progress: ExecutionProgress,
): Promise<void> {
  const stored = planStore.get(workflowId);
  if (!stored) return;

  planStore.set(workflowId, {
    ...stored,
    status: 'executing',
    executionProgress: progress,
    updatedAt: Date.now(),
  });
}

/**
 * Mark plan as completed with final progress
 */
export async function completePlan(
  workflowId: string,
  finalProgress: ExecutionProgress | null,
): Promise<void> {
  const stored = planStore.get(workflowId);
  if (!stored) return;

  planStore.set(workflowId, {
    ...stored,
    status: 'completed',
    executionProgress: finalProgress ?? stored.executionProgress,
    updatedAt: Date.now(),
  });
}

/**
 * Mark plan as failed with final progress
 */
export async function failPlan(
  workflowId: string,
  finalProgress: ExecutionProgress | null,
): Promise<void> {
  const stored = planStore.get(workflowId);
  if (!stored) return;

  planStore.set(workflowId, {
    ...stored,
    status: 'failed',
    executionProgress: finalProgress ?? stored.executionProgress,
    updatedAt: Date.now(),
  });
}

/**
 * Update only the plan_markdown field (preserves status, executionProgress, etc.)
 */
export async function updateStoredPlanMarkdown(
  workflowId: string,
  planMarkdown: string,
): Promise<void> {
  const stored = planStore.get(workflowId);
  if (!stored) return;

  planStore.set(workflowId, {
    ...stored,
    plan: { ...stored.plan, plan_markdown: planMarkdown },
    updatedAt: Date.now(),
  });
}

/**
 * Clear the plan (on dismiss — removes entirely)
 */
export async function clearProposedPlan(workflowId: string): Promise<void> {
  planStore.delete(workflowId);
}

/**
 * Check if a workflow has a proposed plan
 */
export async function hasProposedPlan(workflowId: string): Promise<boolean> {
  const stored = planStore.get(workflowId);
  return stored !== null && stored !== undefined && stored.status === 'proposed';
}

// =============================================================================
// Plan Snapshots (for diff computation in save_plan)
// =============================================================================

/**
 * Save snapshot of the last applied plan (for diff computation in save_plan).
 */
export async function savePreviousPlanSnapshot(workflowId: string, plan: Plan): Promise<void> {
  const snapshot: StoredPlan = {
    workflowId: `${SNAPSHOT_KEY_PREFIX}${workflowId}`,
    plan: normalizePlan(plan),
    status: 'proposed',
    executionProgress: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  planStore.set(snapshot.workflowId, snapshot);
}

/**
 * Get the last applied plan snapshot (null if first proposal).
 */
export async function getPreviousPlanSnapshot(workflowId: string): Promise<Plan | null> {
  const snapshot = planStore.get(`${SNAPSHOT_KEY_PREFIX}${workflowId}`);
  return snapshot?.plan ?? null;
}
