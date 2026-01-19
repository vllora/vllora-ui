import { DistriClient, type DistriMessage } from '@distri/core';
import type { DistriFnTool } from '@distri/core';
import { getDistriUrl } from '@/config/api';
import { fetchLucyConfig, type LucyConfig } from '@/lib/agent-sync';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';
import { getLeafTopicPaths } from './generate-traces';

// Cache for Lucy config
let cachedLucyConfig: LucyConfig | null = null;
const fetchLucyConfigCached = async (): Promise<LucyConfig> => {
  if (cachedLucyConfig) return cachedLucyConfig;
  cachedLucyConfig = await fetchLucyConfig();
  return cachedLucyConfig;
};

// =========================================================================
// Types
// =========================================================================

interface DatasetTopicTree {
  topic_paths: string[][]; // All node paths root->node (includes internal nodes)
}

interface TopicAnalysisResult {
  topic_tree: DatasetTopicTree;
}

export interface AnalyzeRecordsForTopicsParams {
  datasetId?: string;
  datasetName?: string;
  topicContext?: string;
  topic_context?: string;
  maxTopics?: number;
  maxDepth?: number;
  degree?: number;
}

export interface AnalyzeRecordsForTopicsResult {
  success: boolean;
  error?: string;
  warnings?: string;
  dataset_name?: string;
  analysis?: TopicAnalysisResult;
  applied_count?: number;
  auto_applied?: boolean;
  assigned_count?: number;
}

export interface GenerateTopicsParams {
  datasetId?: string;
  dataset_id?: string;
  datasetName?: string;
  dataset_name?: string;
  topicContext?: string;
  topic_context?: string;
  maxTopics?: number;
  max_topics?: number;
  maxDepth?: number;
  max_depth?: number;
  degree?: number;
  branching?: number;
}

// =========================================================================
// Helpers
// =========================================================================

const DEFAULT_TOPIC_MAX_DEPTH = 3;
const DEFAULT_TOPIC_DEGREE = 2;

function normalizeTopicPath(topicPath?: string[]) {
  const normalize = (t: string) => t.trim().replace(/\s+/g, '_').toLowerCase();
  const cleaned = (topicPath || []).map((t) => (t || '').trim()).filter(Boolean).map(normalize);
  return cleaned.length > 0 ? cleaned : ([] as string[]);
}

// =========================================================================
// LLM setup
// =========================================================================

const TOPIC_ANALYSIS_SYSTEM_PROMPT = `You are a hierarchical topic builder.

Goal: Generate concise, hierarchical topic paths (root -> leaf) for a dataset-wide topic tree based on the user's context.

Rules:
- Paths must be lowercase_with_underscores; include the leaf in topic_paths
- Depth must be within the requested range (default 3)
- Be specific and action-oriented; avoid status labels like "error"/"success"
- Output MUST be valid JSON that matches the schema (no markdown, no code fences)

Examples of good paths:
- ["travel", "flights", "booking"]
- ["commerce", "payments", "refunds"]

Examples of too-generic or status-only (avoid):
- ["api_call"]
- ["error_handling"]
- ["failed_request"]
`;

const TOPIC_ASSIGNMENT_SYSTEM_PROMPT = `You are a topic classifier.

Goal: Assign the best matching leaf topic path to each record based on its input/output summaries.

Rules:
- Choose exactly one leaf topic path per record.
- Use only the provided leaf paths; do not invent new topics.
- Output MUST be valid JSON that matches the schema (no markdown, no code fences).
`;

const TOPIC_ANALYSIS_RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'topic_tree',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        topic_paths: {
          type: 'array',
          description: 'All node paths root->node (includes internal nodes).',
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      required: ['topic_paths'],
      additionalProperties: false,
    },
  },
};

const TOPIC_ASSIGNMENT_RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'topic_assignments',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        assignments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              record_id: { type: 'string' },
              topic_path: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['record_id', 'topic_path'],
            additionalProperties: false,
          },
        },
      },
      required: ['assignments'],
      additionalProperties: false,
    },
  },
};

function buildTopicAnalysisPrompt(topicContext: string, maxTopics: number, maxDepth: number, degree: number): string {
  return `## Task
Generate a dataset-wide topic tree (depth 1..${maxDepth}) using the user's context.
Aim for up to ${degree} coherent siblings per level; when evidence allows, propose multiple branches (e.g., root + ${degree} children + ${degree ** 2} grandchildren) but do not exceed ${maxTopics} total leaves.
Return JSON that matches the schema. Provide topic_paths (all node paths) for the dataset.

## User context
${topicContext}

## Guidance (tree-style)
- Think in paths (root -> leaf). Depth must be between 1 and ${maxDepth}.
- Prefer the deepest meaningful path (aim for depth=${maxDepth} when context allows); shorten only if evidence is too weak.
- Populate multiple branches when content allows; avoid collapsing everything into one path.
- Leaf = the most specific topic; include it in topic_path.
- Prefer action/subject paths over status labels. Avoid generic buckets.

## Output requirements
- topic_path elements must be lowercase_with_underscores.
- topic_paths: list of topic_path arrays representing ALL nodes in the tree (include internal nodes like root and intermediate levels). Try to include a complete tree up to depth=${maxDepth} with branching up to degree=${degree} (no duplicate paths).
  - Example (degree=2, depth=3):
    - ["root"]
    - ["root","child_a"], ["root","child_b"]
    - ["root","child_a","grandchild_1"], ["root","child_a","grandchild_2"], ["root","child_b","grandchild_1"], ["root","child_b","grandchild_2"]
- Keep JSON concise: no summaries, no confidence scores.

## Example topic_path
["travel", "flights", "booking"] (leaf)
`;
}

function buildTopicAssignmentPrompt(records: Array<{ record_id: string; input_summary: string; output_summary: string }>, leafPaths: string[][]): string {
  return `## Task
Assign the best matching leaf topic path to each record.

## Leaf topics
${JSON.stringify(leafPaths, null, 2)}

## Records
${JSON.stringify(records, null, 2)}

## Output requirements
- Return JSON that matches the schema.
- Provide exactly one topic_path per record_id.
- Use only the leaf topics provided.
`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function callLLMForTopics(prompt: string): Promise<string> {
  const lucyConfig = await fetchLucyConfigCached();
  const rawUrl = lucyConfig.distri_url || getDistriUrl();
  const baseUrl = `${rawUrl.replace(/\/$/, '')}/v1`;
  const distriClient = DistriClient.create({ baseUrl });

  const modelSettingsFromConfig = lucyConfig.model_settings || {};
  const { response_format: _ignoredResponseFormat, ...modelSettingsBase } = modelSettingsFromConfig as Record<string, unknown>;

  const messages: DistriMessage[] = [
    DistriClient.initDistriMessage('system', [{ part_type: 'text', data: TOPIC_ANALYSIS_SYSTEM_PROMPT }]),
    DistriClient.initDistriMessage('user', [{ part_type: 'text', data: prompt }]),
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await distriClient.llm(messages, [], {
        model_settings: {
          ...modelSettingsBase,
          model: modelSettingsFromConfig.model || 'openai/gpt-4.1',
          temperature: modelSettingsFromConfig.temperature ?? 0.3,
          response_format: TOPIC_ANALYSIS_RESPONSE_SCHEMA,
        },
      });

      if (!response.content) {
        throw new Error('LLM returned empty response');
      }

      return response.content;
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        const backoffMs = 800 * Math.pow(2, attempt);
        await sleep(backoffMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('LLM call failed');
}

async function callLLMForAssignments(prompt: string): Promise<string> {
  const lucyConfig = await fetchLucyConfigCached();
  const rawUrl = lucyConfig.distri_url || getDistriUrl();
  const baseUrl = `${rawUrl.replace(/\/$/, '')}/v1`;
  const distriClient = DistriClient.create({ baseUrl });

  const modelSettingsFromConfig = lucyConfig.model_settings || {};
  const { response_format: _ignoredResponseFormat, ...modelSettingsBase } = modelSettingsFromConfig as Record<string, unknown>;

  const messages: DistriMessage[] = [
    DistriClient.initDistriMessage('system', [{ part_type: 'text', data: TOPIC_ASSIGNMENT_SYSTEM_PROMPT }]),
    DistriClient.initDistriMessage('user', [{ part_type: 'text', data: prompt }]),
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await distriClient.llm(messages, [], {
        model_settings: {
          ...modelSettingsBase,
          model: modelSettingsFromConfig.model || 'openai/gpt-4.1',
          temperature: modelSettingsFromConfig.temperature ?? 0.2,
          response_format: TOPIC_ASSIGNMENT_RESPONSE_SCHEMA,
        },
      });

      if (!response.content) {
        throw new Error('LLM returned empty response');
      }

      return response.content;
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        const backoffMs = 800 * Math.pow(2, attempt);
        await sleep(backoffMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('LLM call failed');
}

function parseTopicAnalysisResponse(content: string): TopicAnalysisResult {
  try {
    const parsed = JSON.parse(content.trim());
    if (Array.isArray(parsed?.topic_paths)) {
      return { topic_tree: { topic_paths: parsed.topic_paths } };
    }
    return { topic_tree: { topic_paths: [] } };
  } catch {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1].trim());
        if (Array.isArray(parsed?.topic_paths)) {
          return { topic_tree: { topic_paths: parsed.topic_paths } };
        }
      }
    } catch {
      // ignore
    }
    return { topic_tree: { topic_paths: [] } };
  }
}

function parseTopicAssignmentResponse(content: string): Array<{ record_id: string; topic_path: string[] }> {
  try {
    const parsed = JSON.parse(content.trim());
    if (Array.isArray(parsed?.assignments)) {
      return parsed.assignments
        .filter((entry: any) => entry && Array.isArray(entry.topic_path) && typeof entry.record_id === 'string')
        .map((entry: any) => ({ record_id: entry.record_id, topic_path: entry.topic_path }));
    }
  } catch {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1].trim());
        if (Array.isArray(parsed?.assignments)) {
          return parsed.assignments
            .filter((entry: any) => entry && Array.isArray(entry.topic_path) && typeof entry.record_id === 'string')
            .map((entry: any) => ({ record_id: entry.record_id, topic_path: entry.topic_path }));
        }
      }
    } catch {
      // ignore
    }
  }
  return [];
}

// =========================================================================
// Tool implementations
// =========================================================================

export async function analyzeRecordsForTopics(params: Record<string, unknown>): Promise<AnalyzeRecordsForTopicsResult> {
  try {
    const { datasetId: paramDatasetId, datasetName, topicContext, topic_context, maxTopics, maxDepth = DEFAULT_TOPIC_MAX_DEPTH, degree = DEFAULT_TOPIC_DEGREE } =
      params as unknown as AnalyzeRecordsForTopicsParams & { maxDepth?: number; degree?: number };
    const autoApply = true;
    const estimatedMaxTopics = degree > 1 ? Math.min(20, Math.max(1, Math.round((Math.pow(degree, maxDepth) - 1) / (degree - 1)))) : maxDepth;
    const effectiveMaxTopics = maxTopics ?? estimatedMaxTopics;
    const resolvedContext = typeof topicContext === 'string'
      ? topicContext
      : typeof topic_context === 'string'
        ? topic_context
        : '';
    const trimmedContext = resolvedContext.trim();

    if (!paramDatasetId && !datasetName) {
      return { success: false, error: 'Either datasetId or datasetName is required' };
    }

    if (!trimmedContext) {
      return { success: false, error: 'topic_context is required to generate dataset topics' };
    }

    const allDatasets = await datasetsDB.getAllDatasets();
    let targetDatasetId = paramDatasetId;

    if (!targetDatasetId && datasetName) {
      const match = allDatasets.find(d => d.name.toLowerCase() === datasetName.toLowerCase());
      if (match) {
        targetDatasetId = match.id;
      } else {
        return {
          success: false,
          error: `Dataset with name "${datasetName}" not found. Available: ${allDatasets.map(d => d.name).join(', ')}`,
        };
      }
    }

    const dataset = allDatasets.find(d => d.id === targetDatasetId);
    if (!dataset || !targetDatasetId) {
      return { success: false, error: `Dataset ${targetDatasetId} not found` };
    }

    const prompt = buildTopicAnalysisPrompt(trimmedContext, effectiveMaxTopics, maxDepth, degree);
    const analysisContent = await callLLMForTopics(prompt);
    const analysis = parseTopicAnalysisResponse(analysisContent);

    const normalizedPaths = (analysis.topic_tree?.topic_paths || [])
      .filter((p) => Array.isArray(p) && p.length > 0)
      .map((p) => normalizeTopicPath(p))
      .filter((p) => p.length > 0);

    if (autoApply) {
      await datasetsDB.updateDatasetTopicContext(targetDatasetId, trimmedContext, normalizedPaths);
    }

    const leafPaths = getLeafTopicPaths(normalizedPaths);
    let assignedCount = 0;
    if (leafPaths.length > 0) {
      const records = await datasetsDB.getRecordsByDatasetId(targetDatasetId);
      if (records.length > 0) {
        const now = Date.now();
        const assignments = new Map<string, string[]>();
        const BATCH_SIZE = 8;
        for (let i = 0; i < records.length; i += BATCH_SIZE) {
          const batch = records.slice(i, i + BATCH_SIZE);
          const summaries = batch.map((record) => {
            const data = record.data as any;
            const inputMessages = Array.isArray(data?.input?.messages) ? data.input.messages : [];
            const userMessages = inputMessages.filter((m: any) => m?.role === 'user');
            const lastUser = userMessages[userMessages.length - 1];
            const inputSummary = lastUser?.content ? String(lastUser.content).slice(0, 200) : JSON.stringify(record.data).slice(0, 200);
            const outputMessage = data?.output?.messages;
            const outputContent = Array.isArray(outputMessage) ? outputMessage[0]?.content : outputMessage?.content;
            const outputSummary = outputContent ? String(outputContent).slice(0, 200) : JSON.stringify(record.data).slice(0, 200);
            return {
              record_id: record.id,
              input_summary: inputSummary,
              output_summary: outputSummary,
            };
          });
          const prompt = buildTopicAssignmentPrompt(summaries, leafPaths);
          const assignmentContent = await callLLMForAssignments(prompt);
          const batchAssignments = parseTopicAssignmentResponse(assignmentContent);
          batchAssignments.forEach(({ record_id, topic_path }) => {
            const normalizedPath = normalizeTopicPath(topic_path);
            if (normalizedPath.length > 0) assignments.set(record_id, normalizedPath);
          });
        }
        await datasetsDB.assignTopicPathsToRecords(targetDatasetId, assignments, now);
        assignedCount = assignments.size;
      }
    }

    return {
      success: true,
      dataset_name: dataset.name,
      analysis: { topic_tree: { topic_paths: normalizedPaths } },
      applied_count: normalizedPaths.length,
      assigned_count: assignedCount,
      auto_applied: autoApply,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to analyze records' };
  }
}

export async function generateTopics(params: Record<string, unknown>): Promise<AnalyzeRecordsForTopicsResult> {
  const { datasetId, dataset_id, datasetName, dataset_name, topicContext, topic_context, maxTopics, max_topics, maxDepth, max_depth, degree, branching } =
    params as unknown as GenerateTopicsParams;

  const resolvedDatasetId = datasetId || dataset_id;
  const resolvedDatasetName = datasetName || dataset_name;
  const resolvedContext = (topicContext || topic_context || '').trim();

  const resolvedMaxDepth = maxDepth ?? max_depth ?? DEFAULT_TOPIC_MAX_DEPTH;
  const resolvedDegree = degree ?? branching ?? DEFAULT_TOPIC_DEGREE;
  const resolvedMaxTopics = maxTopics ?? max_topics;

  return analyzeRecordsForTopics({
    datasetId: resolvedDatasetId,
    datasetName: resolvedDatasetName,
    topicContext: resolvedContext,
    maxTopics: resolvedMaxTopics,
    maxDepth: resolvedMaxDepth,
    degree: resolvedDegree,
  });
}

// =========================================================================
// Tool handler for provider/agent
// =========================================================================

export const generateTopicsHandler: ToolHandler = async ({ dataset_id, dataset_name, topic_context, max_topics, max_depth, degree, branching }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }

  const resolvedContext = typeof topic_context === 'string' ? topic_context : '';
  if (!resolvedContext.trim()) {
    return { success: false, error: 'topic_context is required' };
  }

  return generateTopics({
    datasetId: dataset_id,
    datasetName: dataset_name,
    topicContext: resolvedContext,
    maxTopics: max_topics,
    maxDepth: max_depth,
    degree,
    branching,
  });
};

export const generateTopicsTool: DistriFnTool = {
  name: 'generate_topics',
  description: 'Generate a dataset-wide topic tree based on user context.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      dataset_name: { type: 'string', description: 'Optional dataset name for logging' },
      topic_context: { type: 'string', description: 'User-provided context for topic generation' },
      max_topics: { type: 'number', description: 'Maximum number of topic leaves to return' },
      max_depth: { type: 'number', description: 'Maximum topic depth' },
      degree: { type: 'number', description: 'Branching factor per level' },
      branching: { type: 'number', description: 'Alias for degree' },
    },
    required: ['dataset_id', 'topic_context'],
  },
  handler: async (input: object) => JSON.stringify(await generateTopicsHandler(input as Record<string, unknown>)),
} as DistriFnTool;

