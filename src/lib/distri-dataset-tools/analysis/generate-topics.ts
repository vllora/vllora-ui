import { DistriClient, type DistriMessage } from '@distri/core';
import type { DistriFnTool } from '@distri/core';
import { getDistriUrl } from '@/config/api';
import { fetchLucyConfig, type LucyConfig } from '@/lib/agent-sync';
import type { DatasetRecord } from '@/types/dataset-types';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';
import { getInputSummary, getOutputSummary } from './helpers';
import { getLabel } from '@/components/datasets/record-utils';

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

interface RecordForAnalysis {
  record_id: string;
  label?: string;
  input_summary: string;
  output_summary: string;
  error?: string;
  existing_topic?: string;
}

interface RecordTopicTree {
  record_id: string;
  topic_paths: string[][]; // All node paths root->node (includes internal nodes)
}

interface TopicAnalysisResult {
  topic_trees: RecordTopicTree[];
}

export interface AnalyzeRecordsForTopicsParams {
  datasetId?: string;
  datasetName?: string;
  recordIds?: string[];
  maxTopics?: number;
  maxDepth?: number;
  degree?: number;
}

export interface AnalyzeRecordsForTopicsResult {
  success: boolean;
  error?: string;
  warnings?: string;
  dataset_name?: string;
  records_analyzed?: number;
  analysis?: TopicAnalysisResult;
  applied_count?: number;
  auto_applied?: boolean;
}

export interface GenerateTopicsParams {
  datasetId?: string;
  dataset_id?: string;
  datasetName?: string;
  dataset_name?: string;
  recordIds?: string[];
  record_ids?: string[];
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

function normalizeTopicPath(topicPath?: string[], leaf?: string) {
  const normalize = (t: string) => t.trim().replace(/\s+/g, '_').toLowerCase();
  const cleaned = (topicPath || []).map((t) => (t || '').trim()).filter(Boolean).map(normalize);
  if (cleaned.length > 0) return cleaned;
  if (leaf && leaf.trim()) return [normalize(leaf)];
  return [] as string[];
}

function extractRecordData(record: DatasetRecord): RecordForAnalysis {
  return {
    record_id: record.id,
    label: getLabel(record),
    input_summary: getInputSummary(record.data),
    output_summary: getOutputSummary(record.data),
    existing_topic: record.topic,
  };
}

// =========================================================================
// LLM setup
// =========================================================================

const TOPIC_ANALYSIS_SYSTEM_PROMPT = `You are a hierarchical topic builder.

Goal: Generate concise, hierarchical topic paths (root -> leaf) for dataset records, similar to a topic tree expansion.

Rules:
- Paths must be lowercase_with_underscores; include the leaf in topic_path
- Depth must be within the requested range (default 3)
- Be specific and action-oriented; avoid status labels like "error"/"success"
- Do not invent record IDs; only use provided IDs
- Output MUST be valid JSON that matches the schema (no markdown, no code fences)

Examples of good paths:
- ["travel", "flights", "booking"]
- ["commerce", "payments", "refunds"]

Examples of too-generic or status-only (avoid):
- ["api_call"]
- ["error_handling"]
- ["failed_request"]
`;

const TOPIC_ANALYSIS_RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'topic_analysis',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        topic_trees: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              record_id: { type: 'string' },
              topic_paths: {
                type: 'array',
                description: 'All node paths root->node (includes internal nodes).',
                items: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
            required: ['record_id', 'topic_paths'],
            additionalProperties: false,
          },
        },
      },
      required: ['topic_trees'],
      additionalProperties: false,
    },
  },
};

function buildTopicAnalysisPrompt(records: RecordForAnalysis[], maxTopics: number, maxDepth: number, degree: number): string {
  return `## Task
Generate a small topic tree (depth 1..${maxDepth}) for each record.
Aim for up to ${degree} coherent siblings per level; when evidence allows, propose multiple branches (e.g., root + ${degree} children + ${degree ** 2} grandchildren) but do not exceed ${maxTopics} total leaves.
Return JSON that matches the schema. Provide topic_paths (all node paths) for each record_id.

## Records
${JSON.stringify(records, null, 2)}

## Guidance (tree-style)
- Think in paths (root -> leaf). Depth must be between 1 and ${maxDepth}.
- Prefer the deepest meaningful path (aim for depth=${maxDepth} when context allows); shorten only if evidence is too weak.
- Populate multiple branches when content allows; avoid collapsing everything into one path.
- Leaf = the most specific topic; include it in topic_path.
- Prefer action/subject paths over status labels. Avoid generic buckets.

## Output requirements
- topic_path elements must be lowercase_with_underscores.
- topic_trees: array with one entry per record_id.
- topic_paths: list of topic_path arrays representing ALL nodes in the tree (include internal nodes like root and intermediate levels). Try to include a complete tree up to depth=${maxDepth} with branching up to degree=${degree} (no duplicate paths).
  - Example (degree=2, depth=3):
    - ["root"]
    - ["root","child_a"], ["root","child_b"]
    - ["root","child_a","grandchild_1"], ["root","child_a","grandchild_2"], ["root","child_b","grandchild_1"], ["root","child_b","grandchild_2"]
- Do NOT invent record IDs; only use the provided IDs.
- Keep JSON concise: no summaries, no confidence scores.

## Example topic_path
["travel", "flights", "booking"] (leaf)
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

  const messages: DistriMessage[] = [
    DistriClient.initDistriMessage('system', [{ part_type: 'text', data: TOPIC_ANALYSIS_SYSTEM_PROMPT }]),
    DistriClient.initDistriMessage('user', [{ part_type: 'text', data: prompt }]),
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await distriClient.llm(messages, [], {
        model_settings: {
          ...modelSettingsFromConfig,
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

function parseTopicAnalysisResponse(content: string): TopicAnalysisResult {
  try {
    return JSON.parse(content.trim());
  } catch {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }
    } catch {
      // ignore
    }
    return { topic_trees: [] };
  }
}

// =========================================================================
// Tool implementations
// =========================================================================

export async function analyzeRecordsForTopics(params: Record<string, unknown>): Promise<AnalyzeRecordsForTopicsResult> {
  try {
    const { datasetId: paramDatasetId, datasetName, recordIds, maxTopics, maxDepth = DEFAULT_TOPIC_MAX_DEPTH, degree = DEFAULT_TOPIC_DEGREE } =
      params as unknown as AnalyzeRecordsForTopicsParams & { maxDepth?: number; degree?: number };
    const autoApply = true;
    const estimatedMaxTopics = degree > 1 ? Math.min(20, Math.max(1, Math.round((Math.pow(degree, maxDepth) - 1) / (degree - 1)))) : maxDepth;
    const effectiveMaxTopics = maxTopics ?? estimatedMaxTopics;

    if (!paramDatasetId && !datasetName) {
      return { success: false, error: 'Either datasetId or datasetName is required' };
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

    const allRecords = await datasetsDB.getRecordsByDatasetId(targetDatasetId);

    let selectedRecords = allRecords;
    if (recordIds && Array.isArray(recordIds) && recordIds.length > 0) {
      selectedRecords = allRecords.filter(r => recordIds.includes(r.id));
    }

    const MAX_ANALYSIS_LIMIT = 50;
    if (selectedRecords.length > MAX_ANALYSIS_LIMIT) {
      selectedRecords = selectedRecords
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_ANALYSIS_LIMIT);
    }

    if (selectedRecords.length === 0) {
      return { success: false, error: 'No matching records found in dataset' };
    }

    const recordsForAnalysis = selectedRecords.map(extractRecordData);

    const prompt = buildTopicAnalysisPrompt(recordsForAnalysis, effectiveMaxTopics, maxDepth, degree);
    const analysisContent = await callLLMForTopics(prompt);
    const analysis = parseTopicAnalysisResponse(analysisContent);

    let appliedCount = 0;
    if (autoApply && analysis.topic_trees && analysis.topic_trees.length > 0) {
      for (const entry of analysis.topic_trees) {
        const recordExists = selectedRecords.some(r => r.id === entry.record_id);
        if (!recordExists) continue;

        const normalizedPaths = (entry.topic_paths || [])
          .filter((p) => Array.isArray(p) && p.length > 0)
          .map((p) => normalizeTopicPath(p));

        if (normalizedPaths.length === 0) continue;

        await datasetsDB.updateRecordTopicHierarchy(targetDatasetId, entry.record_id, normalizedPaths);
        appliedCount++;
      }
    }

    return {
      success: true,
      dataset_name: dataset.name,
      records_analyzed: selectedRecords.length,
      analysis,
      applied_count: appliedCount,
      auto_applied: autoApply,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to analyze records' };
  }
}

export async function generateTopics(params: Record<string, unknown>): Promise<AnalyzeRecordsForTopicsResult> {
  const { datasetId, dataset_id, datasetName, dataset_name, recordIds, record_ids, maxTopics, max_topics, maxDepth, max_depth, degree, branching } =
    params as unknown as GenerateTopicsParams;

  const resolvedDatasetId = datasetId || dataset_id;
  const resolvedDatasetName = datasetName || dataset_name;
  const resolvedRecordIds = (recordIds || record_ids || []).filter(Boolean);

  const resolvedMaxDepth = maxDepth ?? max_depth ?? DEFAULT_TOPIC_MAX_DEPTH;
  const resolvedDegree = degree ?? branching ?? DEFAULT_TOPIC_DEGREE;
  const resolvedMaxTopics = maxTopics ?? max_topics;

  // Batch large selections to reduce timeouts
  const TOPIC_BATCH_SIZE = 5;
  if (resolvedRecordIds.length > TOPIC_BATCH_SIZE) {
    let totalAnalyzed = 0;
    let totalApplied = 0;
    const combinedTrees: RecordTopicTree[] = [];
    const batchErrors: string[] = [];

    for (let i = 0; i < resolvedRecordIds.length; i += TOPIC_BATCH_SIZE) {
      const batchIds = resolvedRecordIds.slice(i, i + TOPIC_BATCH_SIZE);
      const result = await analyzeRecordsForTopics({
        datasetId: resolvedDatasetId,
        datasetName: resolvedDatasetName,
        recordIds: batchIds,
        maxTopics: resolvedMaxTopics,
        maxDepth: resolvedMaxDepth,
        degree: resolvedDegree,
      });

      if (!result.success) {
        batchErrors.push(result.error || `Batch ${Math.floor(i / TOPIC_BATCH_SIZE) + 1} failed`);
        continue;
      }

      totalAnalyzed += result.records_analyzed || 0;
      totalApplied += result.applied_count || 0;
      if (result.analysis?.topic_trees) {
        combinedTrees.push(...result.analysis.topic_trees);
      }
    }

    return {
      success: true,
      dataset_name: resolvedDatasetName,
      records_analyzed: totalAnalyzed,
      applied_count: totalApplied,
      auto_applied: true,
      analysis: { topic_trees: combinedTrees },
      warnings: batchErrors.length > 0 ? `${batchErrors.length} batch(es) failed: ${batchErrors.join(' | ')}` : undefined,
    };
  }

  return analyzeRecordsForTopics({
    datasetId: resolvedDatasetId,
    datasetName: resolvedDatasetName,
    recordIds: resolvedRecordIds.length > 0 ? resolvedRecordIds : undefined,
    maxTopics: resolvedMaxTopics,
    maxDepth: resolvedMaxDepth,
    degree: resolvedDegree,
  });
}

// =========================================================================
// Tool handler for provider/agent
// =========================================================================

export const generateTopicsHandler: ToolHandler = async ({ dataset_id, dataset_name, record_ids, max_topics, max_depth, degree, branching }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }

  return generateTopics({
    dataset_id,
    dataset_name,
    record_ids: Array.isArray(record_ids) ? record_ids : undefined,
    max_topics: typeof max_topics === 'number' ? max_topics : undefined,
    max_depth: typeof max_depth === 'number' ? max_depth : undefined,
    degree: typeof degree === 'number' ? degree : typeof branching === 'number' ? branching : undefined,
  });
};

export const generateTopicsTool: DistriFnTool = {
  name: 'generate_topics',
  description: 'Generate and auto-apply topic tags for dataset records using the LLM.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      dataset_name: { type: 'string', description: 'Optional dataset name for logging' },
      record_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: specific record IDs to analyze (default: all)',
      },
      max_topics: {
        type: 'number',
        description: 'Optional: maximum number of topics to suggest (default: 3)',
      },
      max_depth: {
        type: 'number',
        description: 'Optional: maximum depth of topic_path (default: 3)',
      },
      degree: {
        type: 'number',
        description: 'Optional: desired branching factor (siblings per level, default: 3)',
      },
      branching: {
        type: 'number',
        description: 'Alias for degree (branching factor)',
      },
    },
    required: ['dataset_id'],
  },
  handler: async (input: object) => JSON.stringify(await generateTopicsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
