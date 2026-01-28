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
  topic: string; // Leaf topic ID (e.g., "Openings/Italian Game")
}

interface ClassificationResponse {
  classifications: ClassificationResult[];
}

export interface ClassifyRecordsProgress {
  completed: number;
  total: number;
}

export interface ClassifyRecordsParams {
  hierarchy: TopicHierarchyNode[];
  records: DatasetRecord[];
  /** Optional callback for progress updates */
  onProgress?: (progress: ClassifyRecordsProgress) => void;
}

export interface ClassifyRecordsResult {
  success: boolean;
  error?: string;
  classifications?: Map<string, string>; // record_id -> leaf topic ID
  classifiedCount?: number;
}

// =========================================================================
// Helpers
// =========================================================================

/**
 * Get all leaf topic IDs from hierarchy
 */
function getLeafTopicIds(nodes: TopicHierarchyNode[]): string[] {
  const leaves: string[] = [];

  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      leaves.push(...getLeafTopicIds(node.children));
    } else {
      // Leaf node - use id (fallback to name if no id)
      leaves.push(node.id || node.name);
    }
  }

  return leaves;
}

/**
 * Format hierarchy for prompt - include both id and name for clarity
 */
function formatHierarchyForPrompt(nodes: TopicHierarchyNode[]): Array<{ id: string; name: string; children?: unknown[] }> {
  return nodes.map(node => ({
    id: node.id || node.name,
    name: node.name,
    ...(node.children && node.children.length > 0 ? { children: formatHierarchyForPrompt(node.children) } : {}),
  }));
}

// =========================================================================
// LLM setup
// =========================================================================

const CLASSIFICATION_SYSTEM_PROMPT = `You are a record classifier for datasets.

Goal: Classify each record into the most appropriate leaf topic from the provided hierarchy.

Rules:
- Each record must be assigned to exactly one LEAF topic (nodes without children)
- Return the topic ID (not the name) - IDs are unique identifiers like "Openings/Italian Game"
- Choose the most specific and relevant topic for each record
- If a record doesn't fit any topic well, choose the closest match
- Output MUST be valid JSON that matches the schema (no markdown, no code fences)
- Only use topic IDs that exist in the provided hierarchy as leaf nodes
`;

function buildClassificationPrompt(
  hierarchy: TopicHierarchyNode[],
  records: RecordForClassification[]
): string {
  const formattedHierarchy = formatHierarchyForPrompt(hierarchy);

  return `## Topic Hierarchy
Each node has an "id" (unique identifier) and "name" (display name). Return the "id" of the leaf topic.
${JSON.stringify(formattedHierarchy, null, 2)}

## Records to Classify
${JSON.stringify(records, null, 2)}
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
                topic: {
                  type: 'string',
                  description: 'The leaf topic ID (e.g., "Openings/Italian Game")',
                },
              },
              required: ['record_id', 'topic'],
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

// Process a single batch and return classifications
async function processBatch(
  batch: DatasetRecord[],
  hierarchy: TopicHierarchyNode[],
  validLeafTopicIds: Set<string>
): Promise<Map<string, string>> {
  const classifications = new Map<string, string>();
  const recordsForClassification = batch.map(extractRecordData);
  const prompt = buildClassificationPrompt(hierarchy, recordsForClassification);
  const responseContent = await callLLMForClassification(prompt);
  const result = parseClassificationResponse(responseContent);

  if (result.classifications) {
    for (const classification of result.classifications) {
      const recordExists = batch.some(r => r.id === classification.record_id);
      const isValidTopic = classification.topic && validLeafTopicIds.has(classification.topic);

      // LLM returns topic IDs directly - validate against valid leaf IDs
      if (recordExists && isValidTopic) {
        classifications.set(classification.record_id, classification.topic);
      } else if (!isValidTopic && classification.topic) {
        // Log when LLM returns invalid topic (helps debug topic ID vs name issues)
        console.warn(`[classifyRecords] Invalid topic "${classification.topic}" for record ${classification.record_id}. Valid leaf topics:`, Array.from(validLeafTopicIds));
      }
    }
  }

  return classifications;
}

// Maximum concurrent batches to process
const MAX_CONCURRENT_BATCHES = 10;

export async function classifyRecords(params: ClassifyRecordsParams): Promise<ClassifyRecordsResult> {
  try {
    const { hierarchy, records, onProgress } = params;

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

    // Get valid leaf topic IDs for validation
    const validLeafTopicIds = new Set(getLeafTopicIds(hierarchy));

    if (validLeafTopicIds.size === 0) {
      return {
        success: false,
        error: 'Topic hierarchy has no leaf topics',
      };
    }

    const allClassifications = new Map<string, string>();
    const total = records.length;
    let completed = 0;

    // Report initial progress
    onProgress?.({ completed: 0, total });

    // Create all batches
    const batches: DatasetRecord[][] = [];
    for (let i = 0; i < records.length; i += CLASSIFICATION_BATCH_SIZE) {
      batches.push(records.slice(i, i + CLASSIFICATION_BATCH_SIZE));
    }

    // Process batches with limited concurrency for progress tracking
    for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
      const batchGroup = batches.slice(i, i + MAX_CONCURRENT_BATCHES);

      const results = await Promise.all(
        batchGroup.map((batch) => processBatch(batch, hierarchy, validLeafTopicIds))
      );

      // Merge results and update progress
      for (let j = 0; j < batchGroup.length; j++) {
        const batchClassifications = results[j];
        for (const [recordId, topic] of batchClassifications) {
          allClassifications.set(recordId, topic);
        }
        completed += batchGroup[j].length;
      }

      onProgress?.({ completed: Math.min(completed, total), total });
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
