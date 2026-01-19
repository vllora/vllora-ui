/**
 * classify-records.ts
 *
 * LLM-based record classification against a topic hierarchy.
 * Assigns records to topics based on their content and the configured hierarchy.
 */

import { DistriClient, type DistriMessage } from '@distri/core';
import { getDistriUrl } from '@/config/api';
import { fetchLucyConfig, type LucyConfig } from '@/lib/agent-sync';
import type { DatasetRecord, TopicHierarchyNode } from '@/types/dataset-types';
import { getInputSummary, getOutputSummary } from './helpers';

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

interface RecordForClassification {
  record_id: string;
  input_summary: string;
  output_summary: string;
}

interface ClassificationResult {
  record_id: string;
  topic_path: string[]; // Path from root to leaf, e.g., ["Technical Support", "Hardware Issues"]
}

interface ClassificationResponse {
  classifications: ClassificationResult[];
}

export interface ClassifyRecordsParams {
  hierarchy: TopicHierarchyNode[];
  records: DatasetRecord[];
}

export interface ClassifyRecordsResult {
  success: boolean;
  error?: string;
  classifications?: Map<string, string[]>; // record_id -> topic_path
  classifiedCount?: number;
}

// =========================================================================
// Helpers
// =========================================================================

/**
 * Flatten hierarchy into a list of valid topic paths
 */
function getValidTopicPaths(nodes: TopicHierarchyNode[], parentPath: string[] = []): string[][] {
  const paths: string[][] = [];

  for (const node of nodes) {
    const currentPath = [...parentPath, node.name];

    if (node.children && node.children.length > 0) {
      // Add paths from children
      paths.push(...getValidTopicPaths(node.children, currentPath));
    } else {
      // Leaf node - this is a valid classification target
      paths.push(currentPath);
    }
  }

  return paths;
}

/**
 * Format hierarchy as readable text for LLM prompt
 */
function formatHierarchyForPrompt(nodes: TopicHierarchyNode[], indent: number = 0): string {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  for (const node of nodes) {
    lines.push(`${prefix}- ${node.name}`);
    if (node.children && node.children.length > 0) {
      lines.push(formatHierarchyForPrompt(node.children, indent + 1));
    }
  }

  return lines.join('\n');
}

// =========================================================================
// LLM setup
// =========================================================================

const CLASSIFICATION_SYSTEM_PROMPT = `You are a record classifier for datasets.

Goal: Classify each record into the most appropriate topic from the provided hierarchy.

Rules:
- Each record must be assigned to exactly one leaf topic
- The topic_path should be the full path from root to leaf (e.g., ["Technical Support", "Hardware Issues", "Device Malfunction"])
- Choose the most specific and relevant topic for each record
- If a record doesn't fit any topic well, choose the closest match
- Output MUST be valid JSON that matches the schema (no markdown, no code fences)
- Only use topic names that exist in the provided hierarchy
`;

function buildClassificationPrompt(
  hierarchy: TopicHierarchyNode[],
  records: RecordForClassification[]
): string {
  const hierarchyText = formatHierarchyForPrompt(hierarchy);
  const validPaths = getValidTopicPaths(hierarchy);

  return `## Task
Classify each record into the most appropriate topic from the hierarchy below.

## Topic Hierarchy
${hierarchyText}

## Valid Topic Paths (use one of these for each record)
${validPaths.map(p => `- ${JSON.stringify(p)}`).join('\n')}

## Records to Classify
${JSON.stringify(records, null, 2)}

## Output
Return a JSON object with a "classifications" array. Each item should have:
- record_id: The ID of the record
- topic_path: Array of topic names from root to leaf (must match one of the valid paths above)

Example:
{
  "classifications": [
    { "record_id": "abc123", "topic_path": ["Technical Support", "Hardware Issues", "Device Malfunction"] },
    { "record_id": "def456", "topic_path": ["Account Management", "Billing Inquiries"] }
  ]
}
`;
}

function buildClassificationResponseSchema() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'record_classification',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          classifications: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                record_id: { type: 'string' },
                topic_path: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Topic path from root to leaf',
                },
              },
              required: ['record_id', 'topic_path'],
              additionalProperties: false,
            },
          },
        },
        required: ['classifications'],
        additionalProperties: false,
      },
    },
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function callLLMForClassification(prompt: string): Promise<string> {
  const lucyConfig = await fetchLucyConfigCached();
  const rawUrl = lucyConfig.distri_url || getDistriUrl();
  const baseUrl = `${rawUrl.replace(/\/$/, '')}/v1`;
  const distriClient = DistriClient.create({ baseUrl });

  const modelSettingsFromConfig = lucyConfig.model_settings || {};

  const messages: DistriMessage[] = [
    DistriClient.initDistriMessage('system', [{ part_type: 'text', data: CLASSIFICATION_SYSTEM_PROMPT }]),
    DistriClient.initDistriMessage('user', [{ part_type: 'text', data: prompt }]),
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await distriClient.llm(messages, [], {
        model_settings: {
          ...modelSettingsFromConfig,
          model: modelSettingsFromConfig.model || 'openai/gpt-4.1',
          temperature: modelSettingsFromConfig.temperature ?? 0.2,
          response_format: buildClassificationResponseSchema(),
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

function parseClassificationResponse(content: string): ClassificationResponse {
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
    return { classifications: [] };
  }
}

function extractRecordData(record: DatasetRecord): RecordForClassification {
  return {
    record_id: record.id,
    input_summary: getInputSummary(record.data),
    output_summary: getOutputSummary(record.data),
  };
}

// =========================================================================
// Main export
// =========================================================================

const CLASSIFICATION_BATCH_SIZE = 10;

export async function classifyRecords(params: ClassifyRecordsParams): Promise<ClassifyRecordsResult> {
  try {
    const { hierarchy, records } = params;

    if (!hierarchy || hierarchy.length === 0) {
      return {
        success: false,
        error: 'No topic hierarchy configured',
      };
    }

    if (!records || records.length === 0) {
      return {
        success: false,
        error: 'No records to classify',
      };
    }

    const validPaths = getValidTopicPaths(hierarchy);
    if (validPaths.length === 0) {
      return {
        success: false,
        error: 'Topic hierarchy has no leaf topics',
      };
    }

    const allClassifications = new Map<string, string[]>();

    // Process in batches
    for (let i = 0; i < records.length; i += CLASSIFICATION_BATCH_SIZE) {
      const batch = records.slice(i, i + CLASSIFICATION_BATCH_SIZE);
      const recordsForClassification = batch.map(extractRecordData);

      const prompt = buildClassificationPrompt(hierarchy, recordsForClassification);
      const responseContent = await callLLMForClassification(prompt);
      const result = parseClassificationResponse(responseContent);

      if (result.classifications) {
        for (const classification of result.classifications) {
          // Validate that the record exists in our batch
          const recordExists = batch.some(r => r.id === classification.record_id);
          if (recordExists && classification.topic_path && classification.topic_path.length > 0) {
            allClassifications.set(classification.record_id, classification.topic_path);
          }
        }
      }
    }

    return {
      success: true,
      classifications: allClassifications,
      classifiedCount: allClassifications.size,
    };
  } catch (error) {
    console.error('Failed to classify records:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to classify records',
    };
  }
}
