/**
 * Plan Markdown Utilities
 *
 * Plan diff computation for the diff banner.
 * The agent writes all plan markdown directly (plan_markdown field) —
 * the frontend is a pure renderer with no template assembly.
 *
 * Note: markdownToPlan() was removed — Lucy (the AI) now handles all
 * interpretation of user edits via the "Submit for Review" flow.
 */

import type { Plan } from '@/lib/distri-finetune-tools/steps/propose-plan';

// =============================================================================
// Plan Diff
// =============================================================================

export interface PlanDiff {
  topicsAdded: string[];
  topicsRemoved: string[];
  topicsModified: Array<{ name: string; change: string }>;
  criteriaAdded: string[];
  criteriaRemoved: string[];
  criteriaModified: Array<{ name: string; change: string }>;
  hasChanges: boolean;
}

/** Collect all leaf topic names from a topic tree (flat list of names) */
function collectLeafNames(topics: NonNullable<Plan['proposed_topics']>): Map<string, string> {
  const names = new Map<string, string>();
  for (const t of topics) {
    if (t.subtopics && t.subtopics.length > 0) {
      for (const sub of t.subtopics) {
        names.set(sub.name, sub.description || '');
      }
    } else {
      names.set(t.name, t.description || '');
    }
  }
  return names;
}

/**
 * Compute a diff between two plans.
 * If `original` is null (first proposal), all topics/criteria count as "added".
 */
export function diffPlans(original: Plan | null, updated: Plan): PlanDiff {
  // --- Topics diff ---
  const prevTopics = original?.proposed_topics
    ? collectLeafNames(original.proposed_topics)
    : new Map<string, string>();
  const nextTopics = updated.proposed_topics
    ? collectLeafNames(updated.proposed_topics)
    : new Map<string, string>();

  const topicsAdded: string[] = [];
  const topicsRemoved: string[] = [];
  const topicsModified: Array<{ name: string; change: string }> = [];

  for (const [name, desc] of nextTopics) {
    if (!prevTopics.has(name)) {
      topicsAdded.push(name);
    } else if (prevTopics.get(name) !== desc) {
      topicsModified.push({ name, change: 'description changed' });
    }
  }
  for (const name of prevTopics.keys()) {
    if (!nextTopics.has(name)) {
      topicsRemoved.push(name);
    }
  }

  // --- Criteria diff ---
  const prevCriteria = new Map<string, string>(
    (original?.grader_config?.criteria ?? []).map(c => [c.name, c.description])
  );
  const nextCriteria = new Map<string, string>(
    (updated.grader_config?.criteria ?? []).map(c => [c.name, c.description])
  );

  const criteriaAdded: string[] = [];
  const criteriaRemoved: string[] = [];
  const criteriaModified: Array<{ name: string; change: string }> = [];

  for (const [name, desc] of nextCriteria) {
    if (!prevCriteria.has(name)) {
      criteriaAdded.push(name);
    } else if (prevCriteria.get(name) !== desc) {
      criteriaModified.push({ name, change: 'description changed' });
    }
  }
  for (const name of prevCriteria.keys()) {
    if (!nextCriteria.has(name)) {
      criteriaRemoved.push(name);
    }
  }

  const hasChanges =
    topicsAdded.length > 0 ||
    topicsRemoved.length > 0 ||
    topicsModified.length > 0 ||
    criteriaAdded.length > 0 ||
    criteriaRemoved.length > 0 ||
    criteriaModified.length > 0;

  return {
    topicsAdded,
    topicsRemoved,
    topicsModified,
    criteriaAdded,
    criteriaRemoved,
    criteriaModified,
    hasChanges,
  };
}
