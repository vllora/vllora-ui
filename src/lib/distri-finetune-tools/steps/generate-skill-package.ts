/**
 * Generate Skill Package Tool
 *
 * Assembles a Claude Code skill package from the finetune dataset.
 * Zero LLM calls — pure data assembly from IndexedDB.
 *
 * ZIP structure:
 *   {skill-name}/
 *   ├── SKILL.md                     (YAML frontmatter + directive orchestrator)
 *   ├── resources/
 *   │   ├── index.md                 (topic map table)
 *   │   └── {topic-slug}.jsonl       (one per leaf topic)
 *   └── knowledge/
 *       └── domain-knowledge.md      (from knowledge sources, optional)
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
import { extractLeafTopicsFromHierarchy } from '@/components/datasets/topic-hierarchy-utils';

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
  readonly user: string;
  readonly assistant: string;
  readonly eval_scores: Readonly<Record<string, number>>;
  readonly sources: readonly string[];
}

interface TopicGroup {
  readonly topicPath: string;
  readonly slug: string;
  readonly records: readonly DatasetRecord[];
  readonly rows: readonly SkillJsonlRow[];
  readonly diversityScore: number | null;
}

export interface SkillPackageFiles {
  readonly skillName: string;
  readonly skillSlug: string;
  readonly skillMd: string;
  readonly resourcesIndex: string;
  readonly topicFiles: ReadonlyMap<string, string>;
  readonly knowledgeDoc: string | null;
  /** Per-section markdown files: path → content */
  readonly sectionFiles: ReadonlyMap<string, string>;
}

// ─── Helpers ───

/** Slugify a single text segment for use as a path component */
function slugifySegment(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Slugify a full topic path for hierarchical file paths.
 * "Chess/Openings/Sicilian Defense" → "chess/openings/sicilian-defense"
 */
function slugifyPath(topicPath: string): string {
  return topicPath.split('/').map(slugifySegment).join('/');
}

/** Slugify the full dataset objective for use as skill name */
function slugifySkillName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

/** Common acronyms that should be fully uppercased */
const ACRONYMS = new Set([
  'sql', 'api', 'url', 'html', 'css', 'js', 'ts', 'cte', 'ctes',
  'json', 'xml', 'http', 'https', 'jwt', 'oauth', 'sdk', 'cli',
  'gui', 'ui', 'ux', 'ai', 'ml', 'llm', 'db', 'ip', 'dns', 'ssh',
  'ftp', 'fen', 'aws', 'gcp', 'pdf', 'csv', 'yaml', 'toml', 'rag',
]);

/**
 * Convert snake_case topic name to human-readable Title Case.
 * Preserves common acronyms: "writing_sql_queries" → "Writing SQL Queries"
 */
function humanizeName(slug: string): string {
  return slug
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) =>
      ACRONYMS.has(w.toLowerCase())
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(' ');
}

/**
 * Humanize a full topic path.
 * "writing_sql_queries/using_joins" → "Writing SQL Queries / Using Joins"
 */
function humanizePath(path: string): string {
  return path.split('/').map(humanizeName).join(' / ');
}

// ─── JSONL row assembly ───

function assembleJsonlRow(record: DatasetRecord): SkillJsonlRow | null {
  const data = record.data as { input?: { messages?: unknown[] } } | undefined;
  if (!data?.input?.messages) return null;

  const messages = data.input.messages as Array<{
    role?: string;
    content?: string;
  }>;
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
    user: userMsg.content ?? '',
    assistant: (metadata.skillResponse as string) ?? '',
    eval_scores: evalScores,
    sources: Array.isArray(metadata.sourceChunkRefs)
      ? (metadata.sourceChunkRefs as string[])
      : [],
  };
}

// ─── Group records by leaf topic ───

function groupByTopic(
  records: readonly DatasetRecord[],
  hierarchy?: readonly TopicHierarchyNode[],
): readonly TopicGroup[] {
  // Build leaf-name → full-path mapping from existing topic-hierarchy-utils
  const leafPathMap = new Map<string, string>(
    hierarchy
      ? extractLeafTopicsFromHierarchy(hierarchy).map(l => [l.name, l.path.join('/')])
      : [],
  );

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

    // Read diversity score from first record's metadata (same for all records in topic)
    const firstMeta = (topicRecords[0].metadata ?? {}) as Record<string, unknown>;
    const diversityScore =
      typeof firstMeta.diversityScore === 'number' ? firstMeta.diversityScore : null;

    // Resolve full hierarchical path: leaf lookup from hierarchy, fallback to record.topic
    const leaf = topicPath.split('/').pop() ?? topicPath;
    const resolvedPath = leafPathMap.get(leaf) ?? topicPath;

    groups.push({
      topicPath: resolvedPath,
      slug: slugifyPath(resolvedPath),
      records: topicRecords,
      rows,
      diversityScore,
    });
  }

  // Sort groups alphabetically by topic path
  return [...groups].sort((a, b) => a.topicPath.localeCompare(b.topicPath));
}

// ─── Build per-topic JSONL content ───

function buildTopicJsonl(rows: readonly SkillJsonlRow[]): string {
  return rows
    .map((row) => {
      const clean: Record<string, unknown> = {
        user: row.user,
      };
      if (row.assistant) clean.assistant = row.assistant;
      if (Object.keys(row.eval_scores).length > 0) clean.eval_scores = row.eval_scores;
      if (row.sources.length > 0) clean.sources = row.sources;
      return JSON.stringify(clean);
    })
    .join('\n');
}

// ─── Build resources/index.md ───

function buildResourcesIndex(
  topicGroups: readonly TopicGroup[],
  totalCount: number,
): string {
  const hasDiversity = topicGroups.some((g) => g.diversityScore !== null);
  const hasEvalScores = topicGroups.some((g) =>
    g.rows.some((r) => Object.keys(r.eval_scores).length > 0),
  );

  const lines: string[] = [
    '# Resources Index',
    '',
    `${totalCount} examples across ${topicGroups.length} topics.`,
  ];

  if (hasEvalScores) {
    lines.push('Each example includes eval_scores (external grader scores, per evaluation job).');
  }

  lines.push('', '## Topic Map', '');

  // Header — conditionally include Diversity column
  if (hasDiversity) {
    lines.push('| Topic | File | Examples | Diversity |');
    lines.push('|-------|------|----------|-----------|');
  } else {
    lines.push('| Topic | File | Examples |');
    lines.push('|-------|------|----------|');
  }

  for (const group of topicGroups) {
    const leafSlug = slugifySegment(group.topicPath.split('/').pop() ?? group.topicPath);
    const baseCols = `| ${humanizePath(group.topicPath)} | [${leafSlug}.jsonl](${group.slug}.jsonl) | ${group.rows.length}`;

    if (hasDiversity) {
      const diversity =
        group.diversityScore !== null ? group.diversityScore.toFixed(2) : 'N/A';
      lines.push(`${baseCols} | ${diversity} |`);
    } else {
      lines.push(`${baseCols} |`);
    }
  }

  return lines.join('\n');
}

// ─── Build knowledge/domain-knowledge.md ───

/**
 * Build domain-knowledge.md as a sections reference table only.
 * Full content lives in knowledge/sections/*.md — use Read tool to load.
 */
function buildKnowledgeDoc(
  sources: readonly KnowledgeSource[],
  sectionEntries?: ReadonlyArray<{ path: string; title: string; sourceName: string; pageRange?: string }>,
): string | null {
  const readySources = sources.filter((s) => s.status === 'ready' && s.extractedContent);
  if (readySources.length === 0) return null;

  // Only sections with a reference document (page range from PDF extraction)
  const entriesWithRef =
    sectionEntries?.filter((e) => e.pageRange && String(e.title || '').trim()) ?? [];
  if (entriesWithRef.length === 0) return null;

  const lines: string[] = [
    '# Domain Knowledge',
    '',
    'Reference sections from uploaded documents. Use your Read tool to load full content.',
    '',
    '## Section Reference',
    '',
  ];

  const escapeTableCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  lines.push('| Section | File | Source | Pages |');
  lines.push('|---------|------|--------|-------|');

  for (const e of entriesWithRef) {
    const title = escapeTableCell(String(e.title || '').trim() || 'Untitled');
    const sourceName = escapeTableCell(String(e.sourceName || '').trim() || '—');
    const filename = e.path.split('/').pop() ?? e.path;
    const fileLink = `[${filename}](${e.path})`;
    const pages = escapeTableCell(e.pageRange ?? '—');
    lines.push(`| ${title} | ${fileLink} | ${sourceName} | ${pages} |`);
  }

  lines.push('');
  return lines.join('\n');
}

// ─── Build knowledge/sections/ (one file per section with full content) ───

interface SectionEntry {
  readonly sourceName: string;
  readonly sourceSlug: string;
  readonly title: string;
  readonly slug: string;
  readonly content: string;
  readonly pageRange?: string;
}

function collectSectionsFromSources(
  sources: readonly KnowledgeSource[],
): SectionEntry[] {
  const entries: SectionEntry[] = [];
  const readySources = sources.filter((s) => s.status === 'ready' && s.extractedContent);

  for (const source of readySources) {
    const content = source.extractedContent!;
    const metadata = content.metadata as Record<string, unknown> | undefined;
    const extractionMethod = (metadata?.extractionMethod as string) || 'unknown';
    const sourceSlug = slugifySegment(source.name);

    if (extractionMethod === 'local-semantic') {
      const chunks = (metadata?.chunks as Array<{
        id: string;
        heading: string;
        summary: string;
        text: string;
        pageStart: number;
        pageEnd: number;
      }>) || [];
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const pageRange =
          c.pageStart === c.pageEnd
            ? `p.${c.pageStart}`
            : `pp.${c.pageStart}–${c.pageEnd}`;
        entries.push({
          sourceName: source.name,
          sourceSlug,
          title: c.heading,
          slug: slugifySegment(c.heading) || `chunk-${i + 1}`,
          content: [
            `# ${c.heading}`,
            '',
            `**Source:** ${source.name} | **Pages:** ${pageRange}`,
            '',
            `**Summary:** ${c.summary}`,
            '',
            c.text,
          ].join('\n'),
          pageRange,
        });
      }
    } else {
      const sections = (content.sections || []) as Array<{ title: string; content: string; level?: number }>;
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        const slug = slugifySegment(s.title) || `section-${i + 1}`;
        entries.push({
          sourceName: source.name,
          sourceSlug,
          title: s.title || 'Untitled',
          slug,
          content: [
            `# ${s.title || 'Untitled'}`,
            '',
            `**Source:** ${source.name}`,
            '',
            s.content,
          ].join('\n'),
        });
      }
    }
  }

  return entries;
}

/** Section path and title for sidebar display (no content) */
export interface KnowledgeSectionEntry {
  readonly path: string;
  readonly title: string;
}

/** Get section paths from knowledge sources for sidebar tree. */
export function getKnowledgeSectionEntries(
  sources: readonly KnowledgeSource[],
): KnowledgeSectionEntry[] {
  const entries = collectSectionsFromSources(sources);
  if (entries.length === 0) return [];

  const result: KnowledgeSectionEntry[] = [];
  const slugCounts = new Map<string, number>();

  for (const e of entries) {
    const baseSlug = `${e.sourceSlug}-${e.slug}`;
    const count = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, count);
    const path =
      count === 1
        ? `sections/${baseSlug}.md`
        : `sections/${baseSlug}-${count}.md`;
    result.push({ path, title: e.title });
  }
  return result;
}

function buildSectionFiles(
  sources: readonly KnowledgeSource[],
): {
  files: Map<string, string>;
  entries: Array<{ path: string; title: string; sourceName: string; pageRange?: string }>;
} {
  const entries = collectSectionsFromSources(sources);
  if (entries.length === 0) return { files: new Map(), entries: [] };

  const files = new Map<string, string>();
  const sectionEntries: Array<{ path: string; title: string; sourceName: string; pageRange?: string }> = [];
  const slugCounts = new Map<string, number>();

  for (const e of entries) {
    const baseSlug = `${e.sourceSlug}-${e.slug}`;
    const count = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, count);
    const path =
      count === 1
        ? `sections/${baseSlug}.md`
        : `sections/${baseSlug}-${count}.md`;
    files.set(path, e.content);
    sectionEntries.push({
      path,
      title: e.title,
      sourceName: e.sourceName,
      pageRange: e.pageRange,
    });
  }

  return { files, entries: sectionEntries };
}

// ─── Build topic hierarchy as nested markdown list ───

function buildTopicHierarchyList(nodes: readonly TopicHierarchyNode[]): string {
  const lines: string[] = [];

  function walk(node: TopicHierarchyNode, depth: number): void {
    const indent = '    '.repeat(depth);
    const name = humanizeName(node.name);
    const hasChildren = node.children && node.children.length > 0;

    if (hasChildren) {
      // Parent topics: bold name, description on next line if present
      const desc = node.description ? ` — ${node.description}` : '';
      lines.push(`${indent}- **${name}**${desc}`);
      for (const child of node.children!) {
        walk(child, depth + 1);
      }
    } else {
      // Leaf topics: name with description in parentheses
      const desc = node.description ? `: ${node.description}` : '';
      lines.push(`${indent}- ${name}${desc}`);
    }
  }

  for (const node of nodes) {
    walk(node, 0);
  }

  return lines.join('\n');
}

// ─── Build SKILL.md ───

/** Build the folder tree diagram for the Package Structure section */
function buildPackageTree(
  skillSlug: string,
  topicGroups: readonly TopicGroup[],
  hasKnowledge: boolean,
  sectionCount: number,
): string {
  const lines: string[] = [
    `${skillSlug}/`,
    '├── SKILL.md                              ← You are here',
    '├── resources/',
    '│   ├── index.md                          ← Topic map with scores',
  ];

  const sortedGroups = [...topicGroups].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
  const hasSections = sectionCount > 0;
  for (let i = 0; i < sortedGroups.length; i++) {
    const g = sortedGroups[i];
    const prefix =
      i === sortedGroups.length - 1 && !hasKnowledge && !hasSections
        ? '│   └──'
        : '│   ├──';
    lines.push(`${prefix} ${g.slug}.jsonl  (${g.rows.length} examples)`);
  }

  if (hasKnowledge || hasSections) {
    lines.push('└── knowledge/');
    const items: string[] = [];
    if (hasKnowledge) items.push('domain-knowledge.md              ← Overview + section index');
    if (hasSections) {
      items.push(`sections/  (${sectionCount} files)              ← Full content per section`);
    }
    items.forEach((item, i) => {
      const prefix = i === items.length - 1 ? '    └──' : '    ├──';
      lines.push(`${prefix} ${item}`);
    });
  }

  return lines.join('\n');
}

/**
 * Strip "Train a {name} that " prefix from the objective to get a capability description.
 * "Train a chess tutor that analyzes positions..." → "Analyze positions..."
 */
function objectiveToCapability(objective: string, skillName: string): string {
  // Match "Train a/an {name} that/to/which ..." (case-insensitive)
  const escaped = skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^train\\s+(?:a|an)\\s+${escaped}\\s+(?:that|to|which)\\s+`, 'i');
  let stripped = objective.replace(pattern, '');
  // Convert training-style "It should ..." to direct capability voice
  stripped = stripped.replace(/\.\s+It should\s+/g, '. ');
  // Capitalize first letter
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function buildSkillMarkdown(params: {
  readonly skillName: string;
  readonly skillSlug: string;
  readonly objective: string;
  readonly topicCount: number;
  readonly exampleCount: number;
  readonly sourceCount: number;
  readonly topicHierarchyMd: string;
  readonly topicNames: readonly string[];
  readonly criteria: readonly GraderCriterion[];
  readonly hasKnowledge: boolean;
  readonly sectionCount: number;
  readonly topicGroups: readonly TopicGroup[];
}): string {
  const lines: string[] = [];

  const capability = objectiveToCapability(params.objective, params.skillName);

  // Build topic list for description (first 5, with "..." if more)
  const MAX_TOPICS_IN_DESC = 5;
  const topicListItems = params.topicNames.slice(0, MAX_TOPICS_IN_DESC);
  const topicSuffix = params.topicNames.length > MAX_TOPICS_IN_DESC ? ', and more' : '';
  const topicList = topicListItems.map(humanizeName).join(', ') + topicSuffix;

  // Build multi-line description with TRIGGER / DO NOT TRIGGER
  const descLines = [
    `  TRIGGER: When users ask about ${params.skillName} topics including ${topicList}.`,
    `  DO NOT TRIGGER: For general questions unrelated to ${params.skillName}.`,
    `  ${capability}`,
  ];

  // YAML frontmatter — official fields only (name, description)
  lines.push(
    '---',
    `name: ${params.skillSlug}`,
    'description: >',
    ...descLines,
    '---',
    '',
  );

  // Role & Objective
  lines.push(
    `# ${params.skillName}`,
    '',
    '## Role & Objective',
    '',
    `You are a ${params.skillName}. ${capability}`,
    `You have deep knowledge across ${params.topicCount} topics, backed by ${params.exampleCount} curated examples${params.sourceCount > 0 ? ` and ${params.sourceCount} reference ${params.sourceCount === 1 ? 'document' : 'documents'}` : ''}.`,
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
    params.sectionCount,
  );
  lines.push(
    '## Package Structure',
    '',
    '```',
    tree,
    '```',
    '',
  );

  // Response Guidelines — inlined criteria
  lines.push('## Response Guidelines', '');
  if (params.criteria.length > 0) {
    lines.push('Responses are evaluated on:', '');
    for (const c of params.criteria) {
      lines.push(`- **${c.name}**: ${c.description}`);
    }
    lines.push('');
  } else {
    lines.push(
      'Core principles: be helpful, accurate, and concise.',
      '',
    );
  }

  // Using Resources — concise, domain-focused with JSONL format description
  lines.push(
    '## Using Resources',
    '',
    `This skill includes ${params.exampleCount} curated examples across ${params.topicCount} topics`,
    'in the `resources/` directory.',
    '',
    'When responding:',
    '1. Check [resources/index.md](resources/index.md) to find the matching topic file path',
    '2. Load the relevant JSONL file(s)',
    '3. Study the `assistant` field for tone, format, and domain knowledge',
    '',
    '### JSONL Format',
    '',
    'Each line is a JSON object with these fields:',
    '',
    '| Field | Purpose |',
    '|-------|---------|',
    '| `user` | Example question — use to match incoming queries |',
    '| `assistant` | **Primary**: reference answer showing expected style and knowledge |',
    '',
    'Focus on the `assistant` field — it contains the domain knowledge and',
    'demonstrates the expected response patterns.',
    '',
  );

  console.log(params.hasKnowledge, params.sectionCount);
  // Domain Knowledge (Read instruction)
  if (params.hasKnowledge || params.sectionCount > 0) {
    lines.push(
      '## Domain Knowledge',
      '',
      'For deep reference material, use your Read tool to load:',
    );
    if (params.hasKnowledge) {
      lines.push('  - `knowledge/domain-knowledge.md` — overview, key sections, and section index');
    }
    if (params.sectionCount > 0) {
      lines.push(`  - \`knowledge/sections/*.md\` — ${params.sectionCount} section files with full content`);
    }
    lines.push(
      '',
      'Only load these when you need additional context beyond what the examples provide.',
      '',
    );
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
  console.log(dataset);
  if (!dataset) return null;

  const records = await datasetsDB.getRecordsByDatasetId(datasetId);
  console.log(records);
  if (records.length === 0) return null;

  const knowledgeSources = await knowledgeDB.getKnowledgeSourcesByDataset(datasetId);

  const plan = await getProposedPlan(datasetId);
  const graderCriteria: readonly GraderCriterion[] = plan?.grader_config?.criteria ?? [];

  const resolvedName =
    typeof overrideName === 'string' && overrideName.trim()
      ? overrideName.trim()
      : plan?.dataset_name || dataset.name || 'skill-package';
  const skillSlug = slugifySkillName(resolvedName);

  const topicGroups = groupByTopic(records, dataset?.topicHierarchy?.hierarchy);
  const totalRows = topicGroups.reduce((sum, g) => sum + g.rows.length, 0);
  if (totalRows === 0) return null;

  const resourcesIndex = buildResourcesIndex(topicGroups, totalRows);

  const { files: sectionFiles, entries: sectionEntries } = buildSectionFiles(knowledgeSources);
  const knowledgeDoc = buildKnowledgeDoc(knowledgeSources, sectionEntries);
  const sectionCount = sectionFiles.size;

  const topicHierarchyMd =
    dataset.topicHierarchy?.hierarchy
      ? buildTopicHierarchyList(dataset.topicHierarchy.hierarchy)
      : '';

  const readySources = knowledgeSources.filter((s) => s.status === 'ready');

  // Extract top-level topic names for the YAML description trigger list
  const topicNames: readonly string[] = dataset.topicHierarchy?.hierarchy
    ? dataset.topicHierarchy.hierarchy.map((n) => n.name)
    : topicGroups.map((g) => g.topicPath.split('/')[0]);

  const skillMd = buildSkillMarkdown({
    skillName: resolvedName,
    skillSlug,
    objective: dataset.datasetObjective ?? 'This skill provides domain expertise.',
    topicCount: topicGroups.length,
    exampleCount: totalRows,
    sourceCount: readySources.length,
    topicHierarchyMd,
    topicNames,
    criteria: graderCriteria,
    hasKnowledge: knowledgeDoc !== null,
    sectionCount,
    topicGroups,
  });

  const topicFiles = new Map<string, string>();
  for (const group of topicGroups) {
    topicFiles.set(group.slug, buildTopicJsonl(group.rows));
  }

  return {
    skillName: resolvedName,
    skillSlug,
    skillMd,
    resourcesIndex,
    topicFiles,
    knowledgeDoc,
    sectionFiles,
  };
}

// ─── Main handler ───

export const generateSkillPackageHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, skill_name } = params;

    console.log(workflow_id);
    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    console.log(workflow);
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
    root.file('resources/index.md', packageFiles.resourcesIndex);

    for (const [topicSlug, jsonlContent] of packageFiles.topicFiles) {
      root.file(`resources/${topicSlug}.jsonl`, jsonlContent);
    }

    if (packageFiles.knowledgeDoc) {
      root.file('knowledge/domain-knowledge.md', packageFiles.knowledgeDoc);
    }
    for (const [path, content] of packageFiles.sectionFiles) {
      root.file(`knowledge/${path}`, content);
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
- SKILL.md — Directive orchestrator with YAML frontmatter, inlined criteria and topic map
- resources/index.md — Topic map table
- resources/{topic}.jsonl — Per-topic examples sorted by score (one file per leaf topic)
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
  handler: async (input: object) => {
    console.log('input', input);
    return JSON.stringify(
      await generateSkillPackageHandler(input as Record<string, unknown>),
    )
  },
} as DistriFnTool;
