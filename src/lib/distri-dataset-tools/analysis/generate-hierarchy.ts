/**
 * generate-hierarchy.ts
 *
 * LLM-based topic hierarchy generation for datasets.
 * Generates a tree structure of topics based on dataset goals and sample records.
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

interface RecordSample {
  input_summary: string;
  output_summary: string;
}

interface LLMHierarchyNode {
  name: string;
  children: LLMHierarchyNode[]; // Required by strict schema, empty array for leaves
}

interface HierarchyGenerationResult {
  hierarchy: LLMHierarchyNode[];
}

export interface GenerateHierarchyParams {
  goals: string;
  depth: number;
  records: DatasetRecord[];
}

export interface GenerateHierarchyResult {
  success: boolean;
  error?: string;
  hierarchy?: TopicHierarchyNode[];
}

// =========================================================================
// LLM setup
// =========================================================================

const HIERARCHY_GENERATION_SYSTEM_PROMPT = `You are a topic hierarchy designer for datasets.

Goal: Generate a well-organized topic hierarchy tree that can be used to categorize dataset records.

Rules:
- Create a hierarchical tree structure with meaningful topic names
- Topic names should be Title Case (e.g., "Technical Support", "Account Management")
- The hierarchy should be balanced and logical
- Each node should have clear, descriptive names
- Consider the user's goals when designing the hierarchy
- Analyze the sample records to understand the domain
- Output MUST be valid JSON that matches the schema (no markdown, no code fences)

Guidelines:
- Root nodes should represent major categories
- Child nodes should be logical subcategories
- Leaf nodes should be specific enough to be useful for classification
- Avoid overly generic names like "Other" or "Miscellaneous"
- Prefer action/subject-oriented topics over status labels
`;

const HIERARCHY_GENERATION_RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'hierarchy_generation',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        hierarchy: {
          type: 'array',
          description: 'Root nodes of the topic hierarchy tree',
          items: {
            $ref: '#/$defs/node',
          },
        },
      },
      required: ['hierarchy'],
      additionalProperties: false,
      $defs: {
        node: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Topic name in Title Case' },
            children: {
              type: 'array',
              items: { $ref: '#/$defs/node' },
              description: 'Child topic nodes (empty array for leaf nodes)',
            },
          },
          required: ['name', 'children'],
          additionalProperties: false,
        },
      },
    },
  },
};

function buildHierarchyGenerationPrompt(
  goals: string,
  depth: number,
  samples: RecordSample[]
): string {
  const samplesSection = samples.length > 0
    ? `## Sample Records (for context)
${JSON.stringify(samples.slice(0, 10), null, 2)}`
    : '## Sample Records\nNo sample records provided. Generate a general-purpose hierarchy based on the goals.';

  return `## Task
Generate a topic hierarchy tree for categorizing dataset records.

## User's Dataset Goals
${goals || 'No specific goals provided. Generate a general-purpose hierarchy suitable for customer support or conversational data.'}

## Requirements
- Maximum depth: ${depth} levels (root = level 1)
- Create 2-4 root categories
- Each non-leaf node should have 2-4 children (where appropriate)
- Topic names should be Title Case (e.g., "Technical Support", not "technical_support")
- Make topics specific and actionable

${samplesSection}

## Output
Generate a JSON object with a "hierarchy" array containing the root nodes.
Each node MUST have "name" (string) and "children" (array of nodes).
Leaf nodes MUST have "children": [] (empty array).
Do not exceed ${depth} levels of depth.

Example structure for depth=3:
{
  "hierarchy": [
    {
      "name": "Technical Support",
      "children": [
        {
          "name": "Hardware Issues",
          "children": [
            { "name": "Device Malfunction", "children": [] },
            { "name": "Connectivity Problems", "children": [] }
          ]
        },
        {
          "name": "Software Issues",
          "children": [
            { "name": "Installation Errors", "children": [] },
            { "name": "Configuration Problems", "children": [] }
          ]
        }
      ]
    },
    {
      "name": "Account Management",
      "children": [
        { "name": "Billing Inquiries", "children": [] },
        { "name": "Password Reset", "children": [] }
      ]
    }
  ]
}
`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function callLLMForHierarchy(prompt: string): Promise<string> {
  const lucyConfig = await fetchLucyConfigCached();
  const rawUrl = lucyConfig.distri_url || getDistriUrl();
  const baseUrl = `${rawUrl.replace(/\/$/, '')}/v1`;
  const distriClient = DistriClient.create({ baseUrl });

  const modelSettingsFromConfig = lucyConfig.model_settings || {};

  const messages: DistriMessage[] = [
    DistriClient.initDistriMessage('system', [{ part_type: 'text', data: HIERARCHY_GENERATION_SYSTEM_PROMPT }]),
    DistriClient.initDistriMessage('user', [{ part_type: 'text', data: prompt }]),
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await distriClient.llm(messages, [], {
        model_settings: {
          ...modelSettingsFromConfig,
          model: modelSettingsFromConfig.model || 'openai/gpt-4.1',
          temperature: modelSettingsFromConfig.temperature ?? 0.5,
          response_format: HIERARCHY_GENERATION_RESPONSE_SCHEMA,
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

function parseHierarchyResponse(content: string): HierarchyGenerationResult {
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
    return { hierarchy: [] };
  }
}

/**
 * Convert LLM-generated hierarchy to TopicHierarchyNode[] with path-based IDs.
 * IDs are built as "Parent/Child/LeafName" for human readability and LLM compatibility.
 */
function convertToTopicHierarchyNodes(
  nodes: LLMHierarchyNode[],
  parentPath: string = ''
): TopicHierarchyNode[] {
  return nodes.map((node) => {
    // Build path-based ID: "Parent/Child/NodeName"
    const nodeId = parentPath ? `${parentPath}/${node.name}` : node.name;

    return {
      id: nodeId,
      name: node.name,
      // Convert empty children arrays to undefined for cleaner tree structure
      children: node.children && node.children.length > 0
        ? convertToTopicHierarchyNodes(node.children, nodeId)
        : undefined,
    };
  });
}

function extractRecordSamples(records: DatasetRecord[]): RecordSample[] {
  return records.slice(0, 20).map((record) => ({
    input_summary: getInputSummary(record.data),
    output_summary: getOutputSummary(record.data),
  }));
}

// =========================================================================
// Main export
// =========================================================================

export async function generateHierarchy(params: GenerateHierarchyParams): Promise<GenerateHierarchyResult> {
  try {
    const { goals, depth, records } = params;

    const samples = extractRecordSamples(records);
    const prompt = buildHierarchyGenerationPrompt(goals, depth, samples);
    const responseContent = await callLLMForHierarchy(prompt);
    const result = parseHierarchyResponse(responseContent);

    if (!result.hierarchy || result.hierarchy.length === 0) {
      return {
        success: false,
        error: 'LLM did not generate a valid hierarchy',
      };
    }

    const hierarchy = convertToTopicHierarchyNodes(result.hierarchy);

    return {
      success: true,
      hierarchy,
    };
  } catch (error) {
    console.error('Failed to generate hierarchy:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate hierarchy',
    };
  }
}
