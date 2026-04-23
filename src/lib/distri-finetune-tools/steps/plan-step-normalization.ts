/**
 * Plan Step Normalization
 *
 * Central utility to normalize plan.steps_to_execute values.
 * Keeps backward compatibility with legacy "readme" step IDs.
 */

export const CANONICAL_PLAN_STEP_IDS = [
  'topics',
  'adjust_topics',
  'categorize',
  'generate',
  'grader',
  'upload',
  'dryrun',
  'finetune',
] as const;

type CanonicalPlanStepId = (typeof CANONICAL_PLAN_STEP_IDS)[number];

const CANONICAL_PLAN_STEP_SET = new Set<string>(CANONICAL_PLAN_STEP_IDS);
const LEGACY_PLAN_STEP_SET = new Set<string>(['readme']);

export interface NormalizePlanStepsResult {
  steps: CanonicalPlanStepId[];
  unknownSteps: string[];
  strippedLegacySteps: string[];
  hadInput: boolean;
}

interface NormalizePlanStepsOptions {
  /**
   * If input was provided but all steps were stripped (e.g. only "readme"),
   * fall back to the full canonical sequence.
   */
  fallbackToDefaultWhenEmpty?: boolean;
}

export function normalizePlanSteps(
  stepIds?: readonly string[] | null,
  options: NormalizePlanStepsOptions = {}
): NormalizePlanStepsResult {
  const hadInput = Array.isArray(stepIds);
  if (!hadInput) {
    return {
      steps: [],
      unknownSteps: [],
      strippedLegacySteps: [],
      hadInput: false,
    };
  }

  const steps: CanonicalPlanStepId[] = [];
  const unknownSteps: string[] = [];
  const strippedLegacySteps: string[] = [];

  for (const stepId of stepIds) {
    if (LEGACY_PLAN_STEP_SET.has(stepId)) {
      strippedLegacySteps.push(stepId);
      continue;
    }

    if (CANONICAL_PLAN_STEP_SET.has(stepId)) {
      const typed = stepId as CanonicalPlanStepId;
      if (!steps.includes(typed)) {
        steps.push(typed);
      }
      continue;
    }

    unknownSteps.push(stepId);
  }

  if (options.fallbackToDefaultWhenEmpty && steps.length === 0 && stepIds.length > 0) {
    steps.push(...CANONICAL_PLAN_STEP_IDS);
  }

  return {
    steps,
    unknownSteps,
    strippedLegacySteps,
    hadInput: true,
  };
}

export function areStepListsEqual(
  left?: readonly string[] | null,
  right?: readonly string[] | null
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.length !== right.length) return false;

  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}
