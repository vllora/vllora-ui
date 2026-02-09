/**
 * SetupPlanEditor
 *
 * Markdown-based setup plan editor for easy modification.
 * Users can edit the plan directly in markdown format.
 */

import { useState, useCallback, useMemo } from 'react';
import { Check, X, Sparkles, Eye, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { SetupPlan } from '@/lib/distri-finetune-tools/steps/propose-setup-plan';
import LazyMarkdownRenderer from '@/components/chat/LazyMarkdownRenderer';

interface SetupPlanEditorProps {
  plan: SetupPlan;
  onApprove: (plan: SetupPlan) => void;
  onDismiss?: () => void;
}

// Convert SetupPlan to editable markdown with professional formatting
function planToMarkdown(plan: SetupPlan): string {
  // Calculate total examples
  const totalExamples = plan.proposed_topics.reduce((acc, t) => {
    const topicTotal = t.target_count + (t.subtopics?.reduce((s, sub) => s + sub.target_count, 0) || 0);
    return acc + topicTotal;
  }, 0);

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

**Total:** ${plan.proposed_topics.length} topics · ${totalExamples} examples

${topicsTable}

---

## ⚙️ Data Generation

| Setting | Value |
|:--------|:------|
| **Seed Count** | ${plan.data_generation.seed_count} examples |
| **Strategy** | ${plan.data_generation.strategy} |
| **Grounded** | ${plan.data_generation.grounded_in_knowledge ? '✅ Yes' : '❌ No'} |

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

// Parse markdown back to SetupPlan (best effort)
// Handles table format for topics and criteria
function markdownToPlan(md: string, originalPlan: SetupPlan): SetupPlan {
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

export function SetupPlanEditor({ plan, onApprove, onDismiss }: SetupPlanEditorProps) {
  const initialMarkdown = useMemo(() => planToMarkdown(plan), [plan]);
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [isPreview, setIsPreview] = useState(true);

  const handleApprove = useCallback(() => {
    const updatedPlan = markdownToPlan(markdown, plan);
    onApprove(updatedPlan);
  }, [markdown, plan, onApprove]);

  return (
    <div className="flex flex-col h-full">
      {/* Minimal header with mode toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium">Setup Plan</span>
        </div>
        <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5">
          <button
            onClick={() => setIsPreview(true)}
            className={cn(
              'px-2 py-1 text-xs rounded transition-colors flex items-center gap-1',
              isPreview
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Eye className="w-3 h-3" />
            Preview
          </button>
          <button
            onClick={() => setIsPreview(false)}
            className={cn(
              'px-2 py-1 text-xs rounded transition-colors flex items-center gap-1',
              !isPreview
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Edit3 className="w-3 h-3" />
            Edit
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isPreview ? (
          <div className="p-4 text-sm [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_table]:text-xs [&_p]:text-sm [&_li]:text-sm [&_blockquote]:text-sm">
            <LazyMarkdownRenderer content={markdown} />
          </div>
        ) : (
          <Textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            className="w-full h-full min-h-[400px] border-0 rounded-none resize-none font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0 p-4"
            placeholder="Edit the setup plan..."
          />
        )}
      </div>

      {/* Footer - sticky at bottom */}
      <div className="px-4 py-3 border-t border-border/50 bg-muted/20 flex items-center justify-end gap-2">
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss} className="h-8">
            <X className="w-4 h-4 mr-1" />
            Dismiss
          </Button>
        )}
        <Button
          size="sm"
          onClick={handleApprove}
          className="h-8 gap-1 bg-green-600 hover:bg-green-700 text-white"
        >
          <Check className="w-4 h-4" />
          Approve & Execute
        </Button>
      </div>
    </div>
  );
}
