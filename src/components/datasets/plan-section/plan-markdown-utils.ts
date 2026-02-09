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
  // Calculate total examples
  const totalExamples = plan.proposed_topics.reduce((acc, t) => {
    const topicTotal = t.target_count + (t.subtopics?.reduce((s, sub) => s + sub.target_count, 0) || 0);
    return acc + topicTotal;
  }, 0);

  // Count leaf topics recursively (topics without children = where records get assigned)
  const countLeafTopics = (topics: typeof plan.proposed_topics): number => {
    return topics.reduce((acc, t) => {
      if (t.subtopics && t.subtopics.length > 0) {
        // Has children, so this is not a leaf - count its children recursively
        return acc + countLeafTopics(t.subtopics as typeof plan.proposed_topics);
      }
      // No children = leaf topic
      return acc + 1;
    }, 0);
  };
  const leafTopicCount = countLeafTopics(plan.proposed_topics);

  // Build topics table
  const topicsTable = `| Topic | Examples | Description |
|:------|:--------:|:------------|
${plan.proposed_topics.map((t) => {
  const subtopicRows = t.subtopics?.map((s) =>
    `| ↳ ${s.name} | ${s.target_count} | ${s.description || '-'} |`
  ).join('\n') || '';
  return `| **${t.name}** | ${t.target_count} | ${t.description} |${subtopicRows ? '\n' + subtopicRows : ''}`;
}).join('\n')}`;

  // Build criteria table
  const criteriaTable = `| Criterion | Weight | Description |
|:----------|:------:|:------------|
${plan.grader_config.criteria.map((c) =>
  `| ${c.name} | ${Math.round(c.weight * 100)}% | ${c.description} |`
).join('\n')}`;

  // Build execution steps
  const stepsContent = plan.execution_steps.map((s, i) =>
    `| ${i + 1} | ${s.step} | ${s.estimated_time} |`
  ).join('\n');

  const md = `# 📋 ${plan.dataset_name}

> ${plan.objective}

---

## 📚 Knowledge Sources

${plan.knowledge_sources.length > 0
  ? plan.knowledge_sources.map((s) => `- 📄 \`${s.name}\``).join('\n')
  : '_No knowledge sources uploaded_'}

---

## 🎯 Training Topics

**Total:** ${leafTopicCount} topics · ${totalExamples} examples

${topicsTable}

---

## ⚙️ Data Generation

| Setting | Value |
|:--------|:------|
| **Seed Count** | ${plan.data_generation.seed_count} examples |
| **Strategy** | ${plan.data_generation.strategy} |
| **Based on Docs** | ${plan.data_generation.grounded_in_knowledge ? '✅ Yes - uses your uploaded documents' : '❌ No - generates from general knowledge'} |

---

## 📊 Evaluation Criteria

**Passing Threshold:** \`${Math.round(plan.grader_config.passing_threshold * 100)}%\`

${criteriaTable}

### Evaluator Function Preview

\`\`\`javascript
${plan.grader_config.template_preview}
\`\`\`

---

## 🚀 Execution Steps

| Step | Action | Time |
|:----:|:-------|:-----|
${stepsContent}

---

<div align="center">

**📈 Estimated Output:** \`${plan.estimated_records} records\` · **⏱️ Duration:** \`${plan.estimated_duration}\`

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

  // Parse seed count from table row: | **Seed Count** | 50 examples |
  const seedMatch = md.match(/\*\*Seed Count\*\*\s*\|\s*(\d+)/);
  if (seedMatch) {
    plan.data_generation.seed_count = parseInt(seedMatch[1], 10);
  }

  // Parse passing threshold: **Passing Threshold:** `75%`
  const thresholdMatch = md.match(/\*\*Passing Threshold:\*\*\s*`?(\d+)%`?/);
  if (thresholdMatch) {
    plan.grader_config.passing_threshold = parseInt(thresholdMatch[1], 10) / 100;
  }

  // Parse topics from table rows
  // Main topic: | **Topic Name** | 40 | Description |
  // Subtopic: | ↳ Subtopic Name | 20 | Description |
  const topics: typeof plan.proposed_topics = [];
  const topicTableRegex = /\|\s*\*\*([^*|]+)\*\*\s*\|\s*(\d+)\s*\|\s*([^|]*)\|/g;
  const subtopicTableRegex = /\|\s*↳\s*([^|]+)\|\s*(\d+)\s*\|\s*([^|]*)\|/g;

  let currentTopic: (typeof plan.proposed_topics)[0] | null = null;
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

  // Parse criteria from table rows: | Criterion Name | 30% | Description |
  const criteriaTableRegex = /\|\s*([^|*]+)\s*\|\s*(\d+)%\s*\|\s*([^|]+)\|/g;
  const criteria: typeof plan.grader_config.criteria = [];
  let criteriaMatch;

  while ((criteriaMatch = criteriaTableRegex.exec(md)) !== null) {
    const name = criteriaMatch[1].trim();
    const weight = parseInt(criteriaMatch[2], 10);
    const description = criteriaMatch[3].trim();

    // Skip header rows and separator rows
    if (name.toLowerCase() === 'criterion' || name.startsWith(':') || name.startsWith('-')) continue;

    criteria.push({
      name,
      weight: weight / 100,
      description,
    });
  }

  if (criteria.length > 0) {
    plan.grader_config.criteria = criteria;
  }

  return plan;
}
