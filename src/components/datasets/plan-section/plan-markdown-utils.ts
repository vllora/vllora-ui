/**
 * Plan Markdown Utilities
 *
 * Functions to convert between Plan objects and markdown format.
 * Used by PlanEditor for rendering and parsing user edits.
 */

import type { Plan } from '@/lib/distri-finetune-tools/steps/propose-plan';

/**
 * Convert Plan to editable markdown with professional formatting
 */
export function planToMarkdown(plan: Plan): string {
  const topics = plan.proposed_topics ?? [];
  const criteria = plan.grader_config?.criteria ?? [];

  // Calculate total examples
  const totalExamples = topics.reduce((acc, t) => {
    const topicTotal = t.target_count + (t.subtopics?.reduce((s, sub) => s + sub.target_count, 0) || 0);
    return acc + topicTotal;
  }, 0);

  // Count leaf topics recursively (topics without children = where records get assigned)
  const countLeafTopics = (topicList: typeof topics): number => {
    return topicList.reduce((acc, t) => {
      if (t.subtopics && t.subtopics.length > 0) {
        return acc + countLeafTopics(t.subtopics as typeof topics);
      }
      return acc + 1;
    }, 0);
  };
  const leafTopicCount = countLeafTopics(topics);

  // Build topics table — show subtotal for parents instead of 0
  const topicsTable = topics.length > 0
    ? `| Topic | Examples | Description |
|:------|:--------:|:------------|
${topics.map((t) => {
  const parentCount = t.subtopics && t.subtopics.length > 0
    ? t.subtopics.reduce((s, sub) => s + sub.target_count, 0)
    : t.target_count;
  const subtopicRows = t.subtopics?.map((s) =>
    `| ↳ ${s.name} | ${s.target_count} | ${s.description || '-'} |`
  ).join('\n') || '';
  return `| **${t.name}** | ${parentCount} | ${t.description} |${subtopicRows ? '\n' + subtopicRows : ''}`;
}).join('\n')}`
    : '_No topics configured_';

  // Build criteria as bullet list for readability
  const criteriaList = criteria.length > 0
    ? criteria.map((c) =>
      `- **${c.name}** — ${c.description}`
    ).join('\n')
    : '_No evaluation criteria configured_';

  // Map execution step labels to user-friendly names and normalize "Dry Run" to "Evaluation"
  const friendlyStepName = (step: string): string => {
    const lower = step.toLowerCase();
    if (lower.includes('topic')) return 'Set up training categories';
    if (lower.includes('generate') && lower.includes('data')) return 'Generate training data';
    if (lower.includes('evaluat') || lower.includes('configur')) return 'Configure quality checks';
    if (lower.includes('dry') || lower.includes('run evaluation')) return 'Run evaluation';
    if (lower.includes('fine') || lower.includes('setup')) return 'Prepare finetune job';
    return step;
  };

  // Build execution steps as numbered list
  const executionSteps = plan.execution_steps ?? [];
  const stepsContent = executionSteps.map((s, i) =>
    `${i + 1}. **${friendlyStepName(s.step)}** — ${s.estimated_time}`
  ).join('\n');

  // Build response schema section if applicable
  const outputFormatSection = plan.output_format
    ? `## Response Schema

**System Prompt Template:**
\`\`\`json
${JSON.stringify({ role: 'system', content: plan.output_format.system_prompt_template }, null, 2)}
\`\`\`

**Output Schema:**
\`\`\`json
${JSON.stringify(plan.output_format.schema, null, 2)}
\`\`\`

---

`
    : '';

  // Knowledge sources section — only show when there are sources
  const knowledgeSection = (plan.knowledge_sources ?? []).length > 0
    ? `## Knowledge Sources

${(plan.knowledge_sources ?? []).map((s) => `- \`${s.name}\``).join('\n')}

---

`
    : '';

  // Data generation — inline text instead of table
  const dataGenStrategy = plan.data_generation?.strategy ?? 'N/A';
  const dataGenSource = plan.data_generation?.grounded_in_knowledge
    ? 'Based on your uploaded documents.'
    : 'Generated from general knowledge.';

  const md = `# ${plan.dataset_name}

> ${plan.objective}

---

${knowledgeSection}${outputFormatSection}## Training Topics

**${leafTopicCount} topics · ${totalExamples} examples**

${topicsTable}

---

## Data Generation

${dataGenStrategy} ${dataGenSource}

---

## Evaluation Criteria

${criteriaList}

---

## Execution Steps

${stepsContent}

---

**Estimated output:** \`${plan.estimated_records ?? 0} records\` · **Duration:** \`${plan.estimated_duration}\`
`;
  return md;
}

/**
 * Parse markdown back to Plan (best effort)
 * Handles table format for topics and criteria
 */
export function markdownToPlan(md: string, originalPlan: Plan): Plan {
  const plan = JSON.parse(JSON.stringify(originalPlan)) as Plan;

  // Parse topics from table rows
  // Main topic: | **Topic Name** | 40 | Description |
  // Subtopic: | ↳ Subtopic Name | 20 | Description |
  type TopicArray = NonNullable<typeof plan.proposed_topics>;
  const topics: TopicArray = [];
  const topicTableRegex = /\|\s*\*\*([^*|]+)\*\*\s*\|\s*(\d+)\s*\|\s*([^|]*)\|/g;
  const subtopicTableRegex = /\|\s*↳\s*([^|]+)\|\s*(\d+)\s*\|\s*([^|]*)\|/g;

  let currentTopic: TopicArray[0] | null = null;
  let topicMatch;

  // First pass: get all main topics
  while ((topicMatch = topicTableRegex.exec(md)) !== null) {
    const topicName = topicMatch[1].trim();
    const targetCount = parseInt(topicMatch[2], 10);
    const description = topicMatch[3].trim();

    // Skip table headers and non-topic rows
    if (topicName.toLowerCase() === 'topic' || topicName.toLowerCase() === 'criterion') continue;

    currentTopic = {
      name: topicName,
      description,
      target_count: targetCount,
      subtopics: [],
    };
    topics.push(currentTopic);
  }

  // Second pass: get subtopics and assign to nearest preceding topic
  let subtopicMatch;
  const subtopics: { name: string; count: number; desc: string; index: number }[] = [];
  while ((subtopicMatch = subtopicTableRegex.exec(md)) !== null) {
    subtopics.push({
      name: subtopicMatch[1].trim(),
      count: parseInt(subtopicMatch[2], 10),
      desc: subtopicMatch[3].trim(),
      index: subtopicMatch.index,
    });
  }

  // Assign subtopics to topics based on position
  for (const sub of subtopics) {
    // Find the topic that appears before this subtopic
    let parentTopic = null;
    for (const topic of topics) {
      const topicIndex = md.indexOf(`**${topic.name}**`);
      if (topicIndex !== -1 && topicIndex < sub.index) {
        parentTopic = topic;
      }
    }
    if (parentTopic) {
      parentTopic.subtopics = parentTopic.subtopics || [];
      parentTopic.subtopics.push({
        name: sub.name,
        description: sub.desc || '',
        target_count: sub.count,
      });
    }
  }

  if (topics.length > 0) {
    plan.proposed_topics = topics;
  }

  // Parse criteria from bullet list: - **Name** — Description
  // Also handles legacy table format: | Name | Description |
  const parsedCriteria: NonNullable<typeof plan.grader_config>['criteria'] = [];

  // Find the criteria section (handles both with and without emoji prefix)
  const criteriaSection = md.match(/## (?:📊 )?Evaluation Criteria[\s\S]*?(?=---|$)/);
  if (criteriaSection) {
    const section = criteriaSection[0];

    // Try bullet list format first: - **Name** — Description
    const bulletRegex = /- \*\*([^*]+)\*\*\s*[—–-]\s*(.+)/g;
    let bulletMatch;
    while ((bulletMatch = bulletRegex.exec(section)) !== null) {
      parsedCriteria.push({
        name: bulletMatch[1].trim(),
        description: bulletMatch[2].trim(),
      });
    }

    // Fallback to table format if no bullets found
    if (parsedCriteria.length === 0) {
      const criteriaTableRegex = /\|\s*([^|*]+)\s*\|\s*([^|]+)\|/g;
      let criteriaMatch;
      while ((criteriaMatch = criteriaTableRegex.exec(section)) !== null) {
        const name = criteriaMatch[1].trim();
        const description = criteriaMatch[2].trim();
        if (name.toLowerCase() === 'criterion' || name.startsWith(':') || name.startsWith('-')) continue;
        if (description.toLowerCase() === 'description' || description.startsWith(':') || description.startsWith('-')) continue;
        parsedCriteria.push({ name, description });
      }
    }
  }

  if (parsedCriteria.length > 0) {
    if (!plan.grader_config) {
      plan.grader_config = { criteria: parsedCriteria };
    } else {
      plan.grader_config.criteria = parsedCriteria;
    }
  }

  return plan;
}

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
