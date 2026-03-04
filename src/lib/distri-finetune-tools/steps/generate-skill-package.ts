/**
 * Generate Skill Package Tool
 *
 * Assembles a Claude Code skill package from the finetune dataset.
 * Zero LLM calls — pure data assembly from IndexedDB.
 *
 * ZIP structure:
 *   {skill-name}/
 *   ├── SKILL.md                     (YAML frontmatter + directive orchestrator)
 *   ├── knowledge/
 *   │   └── domain-knowledge.md      (from knowledge sources, optional)
 *   ├── examples/
 *   │   ├── index.md                 (topic map table)
 *   │   └── {topic-slug}.jsonl       (one per leaf topic, sorted by baseScore desc)
 *   └── rules/
 *       └── response-guidelines.md   (behavioral rules from grader criteria)
 */

import JSZip from 'jszip';
import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import * as knowledgeDB from '@/services/knowledge-sources-db';
import type {
  DatasetRecord,
  KnowledgeSource,
  TopicHierarchyNode,
} from '@/types/dataset-types';
import type { ToolHandler } from '../types';
import { getProposedPlan } from './proposed-plan-store';
import type { GraderCriterion } from './propose-plan/types';

// ─── Package store (module-level, keyed by workflow ID) ───

const packageStore = new Map<string, Blob>();

/** Retrieve a previously generated package Blob */
export function getPackageBlob(workflowId: string): Blob | undefined {
  return packageStore.get(workflowId);
}

/** Clear a stored package (for memory cleanup) */
export function clearPackageBlob(workflowId: string): void {
  packageStore.delete(workflowId);
}

// ─── Types ───

interface SkillJsonlRow {
  readonly system: string;
  readonly user: string;
  readonly assistant: string;
  readonly base_score: number | null;
  readonly eval_scores: Readonly<Record<string, number>>;
  readonly sources: readonly string[];
}

interface TopicGroup {
  readonly topicPath: string;
  readonly slug: string;
  readonly records: readonly DatasetRecord[];
  readonly rows: readonly SkillJsonlRow[];
  readonly avgBaseScore: number;
  readonly diversityScore: number | null;
}

export interface SkillPackageFiles {
  readonly skillName: string;
  readonly skillSlug: string;
  readonly skillMd: string;
  readonly examplesIndex: string;
  readonly topicFiles: ReadonlyMap<string, string>;
  readonly knowledgeDoc: string | null;
  readonly rulesDoc: string;
}

// ─── Helpers ───

/** Slugify a topic path for use as filename: "Chess/Openings/Sicilian Defense" → "sicilian-defense" */
function slugify(topicPath: string): string {
  const leaf = topicPath.split('/').pop() ?? topicPath;
  return leaf
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Slugify the full dataset objective for use as skill name */
function slugifySkillName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

// ─── JSONL row assembly ───

function assembleJsonlRow(record: DatasetRecord): SkillJsonlRow | null {
  const data = record.data as { input?: { messages?: unknown[] } } | undefined;
  if (!data?.input?.messages) return null;

  const messages = data.input.messages as Array<{
    role?: string;
    content?: string;
  }>;
  const systemMsg = messages.find((m) => m?.role === 'system');
  const userMsg = messages.find((m) => m?.role === 'user');
  if (!userMsg) return null;

  const metadata = (record.metadata ?? {}) as Record<string, unknown>;

  const evalScores: Record<string, number> = {};
  if (record.evaluations) {
    for (const [jobId, evalData] of Object.entries(record.evaluations)) {
      if (evalData?.score != null) evalScores[jobId] = evalData.score;
    }
  }

  return {
    system: systemMsg?.content ?? '',
    user: userMsg.content ?? '',
    assistant: (metadata.skillResponse as string) ?? '',
    base_score: typeof metadata.baseScore === 'number' ? metadata.baseScore : null,
    eval_scores: evalScores,
    sources: Array.isArray(metadata.sourceChunkRefs)
      ? (metadata.sourceChunkRefs as string[])
      : [],
  };
}

// ─── Group records by leaf topic ───

function groupByTopic(records: readonly DatasetRecord[]): readonly TopicGroup[] {
  const grouped = new Map<string, DatasetRecord[]>();

  for (const record of records) {
    const topicPath = record.topic ?? 'Uncategorized';
    const existing = grouped.get(topicPath);
    if (existing) {
      existing.push(record);
    } else {
      grouped.set(topicPath, [record]);
    }
  }

  const groups: TopicGroup[] = [];

  for (const [topicPath, topicRecords] of grouped) {
    const rows: SkillJsonlRow[] = [];
    for (const rec of topicRecords) {
      const row = assembleJsonlRow(rec);
      if (row) rows.push(row);
    }
    if (rows.length === 0) continue;

    // Sort by baseScore descending (best first)
    const sortedRows = [...rows].sort((a, b) => (b.base_score ?? 0) - (a.base_score ?? 0));

    const scores = sortedRows
      .map((r) => r.base_score)
      .filter((s): s is number => s !== null);
    const avgBaseScore =
      scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0;

    // Read diversity score from first record's metadata (same for all records in topic)
    const firstMeta = (topicRecords[0].metadata ?? {}) as Record<string, unknown>;
    const diversityScore =
      typeof firstMeta.diversityScore === 'number' ? firstMeta.diversityScore : null;

    groups.push({
      topicPath,
      slug: slugify(topicPath),
      records: topicRecords,
      rows: sortedRows,
      avgBaseScore,
      diversityScore,
    });
  }

  // Sort groups alphabetically by topic path
  return [...groups].sort((a, b) => a.topicPath.localeCompare(b.topicPath));
}

// ─── Build per-topic JSONL content ───

function buildTopicJsonl(rows: readonly SkillJsonlRow[]): string {
  return rows.map((row) => JSON.stringify(row)).join('\n');
}

// ─── Build examples/index.md ───

function buildExamplesIndex(
  topicGroups: readonly TopicGroup[],
  totalCount: number,
): string {
  const lines: string[] = [
    '# Examples Index',
    '',
    `${totalCount} examples across ${topicGroups.length} topics.`,
    'Each example includes base_score (LLM self-assessment) and eval_scores (external grader, per-job).',
    '',
    '## Topic Map',
    '',
    '| Topic | File | Examples | Avg Score | Diversity |',
    '|-------|------|----------|-----------|-----------|',
  ];

  for (const group of topicGroups) {
    const diversity =
      group.diversityScore !== null ? group.diversityScore.toFixed(2) : 'N/A';
    lines.push(
      `| ${group.topicPath} | [${group.slug}.jsonl](${group.slug}.jsonl) | ${group.rows.length} | ${group.avgBaseScore.toFixed(2)} | ${diversity} |`,
    );
  }

  return lines.join('\n');
}

// ─── Build rules/response-guidelines.md ───

function buildResponseGuidelines(
  criteria: readonly GraderCriterion[],
  objective: string | undefined,
): string {
  const lines: string[] = ['# Response Guidelines', ''];

  lines.push('## Core Principles', '');
  if (objective) {
    lines.push(objective, '');
  } else {
    lines.push('Provide helpful, accurate, and concise responses.', '');
  }

  lines.push('## Quality Criteria', '');
  if (criteria.length > 0) {
    lines.push(
      'Responses are evaluated on the following criteria:',
      '',
    );
    for (const criterion of criteria) {
      lines.push(`- **${criterion.name}** — ${criterion.description}`);
    }
    lines.push('');
  } else {
    lines.push(
      '- Be helpful, accurate, and concise',
      '- Provide clear explanations with relevant examples',
      '- Acknowledge uncertainty when appropriate',
      '- Stay within the scope of your expertise',
      '',
    );
  }

  lines.push('## Tone and Style', '');
  if (objective) {
    lines.push(
      `Respond in a manner consistent with the role: ${objective}`,
      '',
      '- Use clear, accessible language',
      '- Provide concrete examples over abstract principles',
      '- Acknowledge when multiple valid approaches exist',
    );
  } else {
    lines.push(
      '- Conversational but precise',
      '- Use concrete examples over abstract principles',
      '- Acknowledge when multiple valid approaches exist',
    );
  }

  return lines.join('\n');
}

// ─── Build knowledge/domain-knowledge.md ───

function buildKnowledgeDoc(
  sources: readonly KnowledgeSource[],
): string | null {
  const readySources = sources.filter((s) => s.status === 'ready' && s.extractedContent);
  if (readySources.length === 0) return null;

  const lines: string[] = ['# Domain Knowledge', ''];

  for (const source of readySources) {
    const content = source.extractedContent!;
    lines.push(`## ${source.name}`, '');

    if (content.metadata?.summary) {
      lines.push(String(content.metadata.summary), '');
    }

    if (content.sectionHeadings && content.sectionHeadings.length > 0) {
      lines.push('### Key Sections', '');
      for (const heading of content.sectionHeadings) {
        lines.push(`- ${heading}`);
      }
      lines.push('');
    }

    if (content.sections && content.sections.length > 0) {
      lines.push('### Reference Sections', '');
      for (const section of content.sections.slice(0, 20)) {
        lines.push(`#### ${section.title}`, '');
        // Truncate long content to keep file manageable
        const truncated =
          section.content.length > 500
            ? `${section.content.slice(0, 500)}...`
            : section.content;
        lines.push(truncated, '');
      }
    }

    lines.push('---', '');
  }

  return lines.join('\n');
}

// ─── Build topic hierarchy as nested markdown list ───

function buildTopicHierarchyList(nodes: readonly TopicHierarchyNode[]): string {
  const lines: string[] = [];

  function walk(node: TopicHierarchyNode, depth: number): void {
    const indent = '  '.repeat(depth);
    const desc = node.description ? ` (${node.description})` : '';
    lines.push(`${indent}- ${node.name}${desc}`);
    if (node.children) {
      for (const child of node.children) {
        walk(child, depth + 1);
      }
    }
  }

  for (const node of nodes) {
    walk(node, 0);
  }

  return lines.join('\n');
}

// ─── Select top representative examples ───

function selectTopExamples(
  groups: readonly TopicGroup[],
  maxCount: number,
): readonly { topicPath: string; row: SkillJsonlRow }[] {
  // Pick the highest-scored record from each major topic group
  const candidates = groups
    .filter((g) => g.rows.length > 0)
    .map((g) => ({
      topicPath: g.topicPath,
      row: g.rows[0], // already sorted by baseScore desc
      score: g.rows[0].base_score ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  return candidates.slice(0, maxCount);
}

// ─── Build SKILL.md ───

/** Build the folder tree diagram for the Package Structure section */
function buildPackageTree(
  skillSlug: string,
  topicGroups: readonly TopicGroup[],
  hasKnowledge: boolean,
): string {
  const lines: string[] = [
    `${skillSlug}/`,
    '├── SKILL.md                              ← You are here',
    '├── rules/',
    '│   └── response-guidelines.md            ← Quality criteria & tone guidelines',
    '├── examples/',
    '│   ├── index.md                          ← Topic map with scores',
  ];

  const sortedGroups = [...topicGroups].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
  for (let i = 0; i < sortedGroups.length; i++) {
    const g = sortedGroups[i];
    const prefix =
      i === sortedGroups.length - 1 && !hasKnowledge
        ? '│   └──'
        : '│   ├──';
    lines.push(`${prefix} ${g.slug}.jsonl  (${g.rows.length} examples)`);
  }

  if (hasKnowledge) {
    lines.push(
      '└── knowledge/',
      '    └── domain-knowledge.md              ← Reference documents',
    );
  }

  return lines.join('\n');
}

function buildSkillMarkdown(params: {
  readonly skillName: string;
  readonly skillSlug: string;
  readonly objective: string;
  readonly topicCount: number;
  readonly exampleCount: number;
  readonly sourceCount: number;
  readonly topicHierarchyMd: string;
  readonly criteria: readonly GraderCriterion[];
  readonly examplesIndex: string;
  readonly hasKnowledge: boolean;
  readonly topicGroups: readonly TopicGroup[];
  readonly representativeExamples: readonly { topicPath: string; row: SkillJsonlRow }[];
}): string {
  const lines: string[] = [];

  // YAML frontmatter
  lines.push(
    '---',
    `name: ${params.skillSlug}`,
    `description: ${params.objective}`,
    `argument-hint: "<your question about ${params.skillName}>"`,
    '---',
    '',
  );

  // Role & Objective
  lines.push(
    `# ${params.skillName}`,
    '',
    '## Role & Objective',
    '',
    `You are an expert in this domain. ${params.objective}`,
    `You have deep knowledge across ${params.topicCount} topics, backed by ${params.exampleCount} curated examples${params.sourceCount > 0 ? ` and ${params.sourceCount} reference documents` : ''}.`,
    '',
  );

  // Expertise Areas
  if (params.topicHierarchyMd) {
    lines.push('### Expertise Areas', '', params.topicHierarchyMd, '');
  }

  // Package Structure — dynamic tree showing all bundled files
  const tree = buildPackageTree(
    params.skillSlug,
    params.topicGroups,
    params.hasKnowledge,
  );
  lines.push(
    '## Package Structure',
    '',
    '```',
    tree,
    '```',
    '',
  );

  // Response Guidelines — brief summary + link (NOT inlined)
  lines.push('## Response Guidelines', '');
  lines.push(
    'See [rules/response-guidelines.md](rules/response-guidelines.md) for full guidelines.',
    '',
  );
  if (params.criteria.length > 0) {
    lines.push('Responses are evaluated on:', '');
    for (const c of params.criteria) {
      lines.push(`- **${c.name}**`);
    }
    lines.push('');
  } else {
    lines.push(
      'Core principles: be helpful, accurate, and concise.',
      '',
    );
  }

  // Available Examples — topic map table + reference link
  // Strip the "# Examples Index" header but keep the table (Claude needs it)
  const indexContent = params.examplesIndex
    .replace(/^# Examples Index\n*/, '')
    .trim();
  lines.push(
    '## Available Examples',
    '',
    'See [examples/index.md](examples/index.md) for the full topic index.',
    '',
    indexContent,
    '',
  );

  // How to Use Examples
  lines.push(
    '## How to Use Examples (IMPORTANT)',
    '',
    'Before answering any question:',
    '1. Read the topic map above to identify which topic file(s) match the user\'s question',
    '2. Use your Read tool to load `examples/{topic}.jsonl` for the matching topic(s)',
    '3. Study the examples for tone, format, and domain accuracy',
    '4. Answer the user\'s question following those patterns',
    '',
    `You have access to ${params.exampleCount} examples across ${params.topicCount} topics.`,
    'ALWAYS load relevant examples before responding.',
    'DO NOT guess — check the examples first.',
    '',
  );

  // Domain Knowledge (Read instruction)
  if (params.hasKnowledge) {
    lines.push(
      '## Domain Knowledge',
      '',
      'For deep reference material, use your Read tool to load:',
      '  `knowledge/domain-knowledge.md`',
      '',
      'Only load this when you need additional context beyond what the examples provide.',
      '',
    );
  }

  // Representative Examples
  if (params.representativeExamples.length > 0) {
    lines.push(
      '## Representative Examples',
      '',
      'These are the highest-scored examples across major topic areas. Use them as',
      'immediate reference — for more examples on any topic, load the relevant JSONL file.',
      '',
    );

    for (const ex of params.representativeExamples) {
      const leaf = ex.topicPath.split('/').pop() ?? ex.topicPath;
      const score = ex.row.base_score !== null ? ex.row.base_score.toFixed(2) : 'N/A';
      lines.push(
        `### ${leaf} (Score: ${score})`,
        `**User**: ${ex.row.user}`,
        `**Assistant**: ${ex.row.assistant}`,
        '',
      );
    }
  }

  return lines.join('\n');
}

// ─── Reusable assembly (no ZIP, no side-effects) ───

/**
 * Assemble all skill package files from dataset data.
 * Pure data assembly — zero LLM calls, ~100ms.
 * Returns null if the dataset has no usable records.
 *
 * @param datasetId - The dataset ID to assemble files for
 * @param overrideName - Optional skill name override (defaults to plan name → dataset name)
 */
export async function assembleSkillPackageFiles(
  datasetId: string,
  overrideName?: string,
): Promise<SkillPackageFiles | null> {
  const dataset = await datasetsDB.getDatasetById(datasetId);
  if (!dataset) return null;

  const records = await datasetsDB.getRecordsByDatasetId(datasetId);
  if (records.length === 0) return null;

  const knowledgeSources = await knowledgeDB.getKnowledgeSourcesByDataset(datasetId);

  const plan = await getProposedPlan(datasetId);
  const graderCriteria: readonly GraderCriterion[] = plan?.grader_config?.criteria ?? [];

  const resolvedName =
    typeof overrideName === 'string' && overrideName.trim()
      ? overrideName.trim()
      : plan?.dataset_name || dataset.name || 'skill-package';
  const skillSlug = slugifySkillName(resolvedName);

  const topicGroups = groupByTopic(records);
  const totalRows = topicGroups.reduce((sum, g) => sum + g.rows.length, 0);
  if (totalRows === 0) return null;

  const examplesIndex = buildExamplesIndex(topicGroups, totalRows);

  const rulesDoc = buildResponseGuidelines(
    graderCriteria,
    dataset.datasetObjective ?? undefined,
  );

  const knowledgeDoc = buildKnowledgeDoc(knowledgeSources);

  const topicHierarchyMd =
    dataset.topicHierarchy?.hierarchy
      ? buildTopicHierarchyList(dataset.topicHierarchy.hierarchy)
      : '';

  const readySources = knowledgeSources.filter((s) => s.status === 'ready');
  const representativeExamples = selectTopExamples(topicGroups, 5);

  const skillMd = buildSkillMarkdown({
    skillName: resolvedName,
    skillSlug,
    objective: dataset.datasetObjective ?? 'This skill provides domain expertise.',
    topicCount: topicGroups.length,
    exampleCount: totalRows,
    sourceCount: readySources.length,
    topicHierarchyMd,
    criteria: graderCriteria,
    examplesIndex,
    hasKnowledge: knowledgeDoc !== null,
    topicGroups,
    representativeExamples,
  });

  const topicFiles = new Map<string, string>();
  for (const group of topicGroups) {
    topicFiles.set(group.slug, buildTopicJsonl(group.rows));
  }

  return {
    skillName: resolvedName,
    skillSlug,
    skillMd,
    examplesIndex,
    topicFiles,
    knowledgeDoc,
    rulesDoc,
  };
}

// ─── Main handler ───

export const generateSkillPackageHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, skill_name } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    const overrideName = typeof skill_name === 'string' ? skill_name : undefined;
    const packageFiles = await assembleSkillPackageFiles(workflow.datasetId, overrideName);

    if (!packageFiles) {
      return { success: false, error: 'No valid records could be assembled' };
    }

    const { skillName: resolvedName, skillSlug } = packageFiles;

    // Assemble ZIP with {skill-name}/ prefix
    const zip = new JSZip();
    const root = zip.folder(skillSlug)!;

    root.file('SKILL.md', packageFiles.skillMd);
    root.file('rules/response-guidelines.md', packageFiles.rulesDoc);
    root.file('examples/index.md', packageFiles.examplesIndex);

    for (const [topicSlug, jsonlContent] of packageFiles.topicFiles) {
      root.file(`examples/${topicSlug}.jsonl`, jsonlContent);
    }

    if (packageFiles.knowledgeDoc) {
      root.file('knowledge/domain-knowledge.md', packageFiles.knowledgeDoc);
    }

    const blob = await zip.generateAsync({ type: 'blob' });

    // Store for download
    packageStore.set(workflow_id, blob);

    const totalRows = [...packageFiles.topicFiles.values()]
      .reduce((sum, content) => sum + content.split('\n').filter(Boolean).length, 0);

    // Update workflow state
    await workflowDB.updateStepData(workflow_id, 'skillPackaging', {
      recordCount: totalRows,
      packagedAt: Date.now(),
      skillName: resolvedName,
    });

    return {
      success: true,
      skill_name: resolvedName,
      skill_slug: skillSlug,
      record_count: totalRows,
      topic_count: packageFiles.topicFiles.size,
      package_size_bytes: blob.size,
      has_knowledge: packageFiles.knowledgeDoc !== null,
      has_eval_rules: Boolean(
        (await datasetsDB.getDatasetById(workflow.datasetId))?.evalScript,
      ),
      message: `Skill package "${resolvedName}" generated with ${totalRows} examples across ${packageFiles.topicFiles.size} topics. Use download_skill_package to save.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate skill package',
    };
  }
};

// ─── Tool definition ───

export const generateSkillPackageTool: DistriFnTool = {
  name: 'generate_skill_package',
  description: `Assemble a Claude Code skill package ZIP from the finetune dataset.

Zero LLM calls — pure data assembly from IndexedDB records.

The package follows the Agent Skills standard and includes:
- SKILL.md — Directive orchestrator with YAML frontmatter, inlined rules and topic map
- examples/index.md — Topic map table
- examples/{topic}.jsonl — Per-topic examples sorted by score (one file per leaf topic)
- rules/response-guidelines.md — Behavioral rules from grader criteria
- knowledge/domain-knowledge.md — Extracted content from uploaded documents (if any)

After generating, use download_skill_package to save the ZIP file.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      skill_name: {
        type: 'string',
        description: 'Name for the skill package. Defaults to the dataset name.',
      },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input: object) =>
    JSON.stringify(
      await generateSkillPackageHandler(input as Record<string, unknown>),
    ),
} as DistriFnTool;
