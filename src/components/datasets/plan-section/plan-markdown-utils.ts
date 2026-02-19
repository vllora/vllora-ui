/**
 * Plan Markdown Utilities
 *
 * Functions to convert between SetupPlan objects and markdown format.
 * Used by SetupPlanEditor for rendering and parsing user edits.
 */

import type { SetupPlan } from '@/lib/distri-finetune-tools/steps/propose-setup-plan';

/**
 * Convert SetupPlan to editable markdown with professional formatting
 */
export function planToMarkdown(plan: SetupPlan): string {
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

  // Build topics table
  const topicsTable = topics.length > 0
    ? `| Topic | Examples | Description |
|:------|:--------:|:------------|
${topics.map((t) => {
  const subtopicRows = t.subtopics?.map((s) =>
    `| ↳ ${s.name} | ${s.target_count} | ${s.description || '-'} |`
  ).join('\n') || '';
  return `| **${t.name}** | ${t.target_count} | ${t.description} |${subtopicRows ? '\n' + subtopicRows : ''}`;
}).join('\n')}`
    : '_No topics configured_';

  // Build criteria table (simple list, all equally weighted)
  const criteriaTable = criteria.length > 0
    ? `| Criterion | Description |
|:----------|:------------|
${criteria.map((c) =>
  `| ${c.name} | ${c.description} |`
).join('\n')}`
    : '_No evaluation criteria configured_';

  // Build execution steps
  const executionSteps = plan.execution_steps ?? [];
  const stepsContent = executionSteps.map((s, i) =>
    `| ${i + 1} | ${s.step} | ${s.estimated_time} |`
  ).join('\n');

  // Build response schema section if applicable
  const outputFormatSection = plan.output_format
    ? `## 🔍 Response Schema

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

  const md = `# 📋 ${plan.dataset_name}

> ${plan.objective}

---

## 📚 Knowledge Sources

${(plan.knowledge_sources ?? []).length > 0
  ? (plan.knowledge_sources ?? []).map((s) => `- 📄 \`${s.name}\``).join('\n')
  : '_No knowledge sources uploaded_'}

---

${outputFormatSection}## 🎯 Training Topics

**Total:** ${leafTopicCount} topics · ${totalExamples} examples

${topicsTable}

---

## ⚙️ Data Generation

| Setting | Value |
|:--------|:------|
| **Strategy** | ${plan.data_generation?.strategy ?? 'N/A'} |
| **Based on Docs** | ${plan.data_generation?.grounded_in_knowledge ? '✅ Yes - uses your uploaded documents' : '❌ No - generates from general knowledge'} |

---

## 📊 Evaluation Criteria

${criteriaTable}

---

## 🚀 Execution Steps

| Step | Action | Time |
|:----:|:-------|:-----|
${stepsContent}

---

<div align="center">

**📈 Estimated Output:** \`${plan.estimated_records ?? 0} records\` · **⏱️ Duration:** \`${plan.estimated_duration}\`

</div>
`;
  return md;
}

/**
 * Parse markdown back to SetupPlan (best effort)
 * Handles table format for topics and criteria
 */
export function markdownToPlan(md: string, originalPlan: SetupPlan): SetupPlan {
  const plan = JSON.parse(JSON.stringify(originalPlan)) as SetupPlan;

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

  // Parse criteria from table rows: | Criterion Name | Description |
  const criteriaTableRegex = /\|\s*([^|*]+)\s*\|\s*([^|]+)\|/g;
  const parsedCriteria: NonNullable<typeof plan.grader_config>['criteria'] = [];
  let criteriaMatch;

  // Find the criteria section
  const criteriaSection = md.match(/## 📊 Evaluation Criteria[\s\S]*?(?=---|$)/);
  if (criteriaSection) {
    const section = criteriaSection[0];
    while ((criteriaMatch = criteriaTableRegex.exec(section)) !== null) {
      const name = criteriaMatch[1].trim();
      const description = criteriaMatch[2].trim();

      // Skip header rows and separator rows
      if (name.toLowerCase() === 'criterion' || name.startsWith(':') || name.startsWith('-')) continue;
      if (description.toLowerCase() === 'description' || description.startsWith(':') || description.startsWith('-')) continue;

      parsedCriteria.push({
        name,
        description,
      });
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
function collectLeafNames(topics: NonNullable<SetupPlan['proposed_topics']>): Map<string, string> {
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
export function diffPlans(original: SetupPlan | null, updated: SetupPlan): PlanDiff {
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
