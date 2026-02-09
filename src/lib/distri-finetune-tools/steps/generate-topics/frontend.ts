/**
 * Frontend-based topic hierarchy generation
 *
 * Uses LLM to generate topic hierarchy with support for:
 * - Seed topics from knowledge sources (PDFs)
 * - Training goals context
 * - Focus areas
 */

import type { TopicHierarchyNode } from '@/types/dataset-types';
import type { DatasetRecord } from '@/types/dataset-types';
import { DistriClient, type DistriMessage } from '@distri/core';
import { getDistriUrl } from '@/config/api';
import { fetchLucyConfig, type LucyConfig } from '@/lib/agent-sync';
import * as datasetsDB from '@/services/datasets-db';

// Cache for Lucy config
let cachedLucyConfig: LucyConfig | null = null;
const fetchLucyConfigCached = async (): Promise<LucyConfig> => {
  if (cachedLucyConfig) return cachedLucyConfig;
  cachedLucyConfig = await fetchLucyConfig();
  return cachedLucyConfig;
};

export interface GenerateTopicsResult {
  success: boolean;
  hierarchy?: TopicHierarchyNode[];
  error?: string;
}

export interface GenerateTopicsOptions {
  datasetId: string;
  depth: number;
  degree: number;
  maxTopics?: number;
  trainingGoals?: string;
  focus?: string;
  seedTopics?: string[];
}

// =============================================================================
// LLM Prompt Building
// =============================================================================

function buildSystemPrompt(seedTopics?: string[]): string {
  let prompt = `You are a hierarchical topic builder for training datasets.

Goal: Generate a topic hierarchy that will be used to organize and generate training data.

Rules:
- Topic names must be lowercase_with_underscores
- Create a balanced tree structure with the requested depth and branching
- Topics should be specific and actionable, not generic
- Output MUST be valid JSON matching the schema (no markdown, no code fences)`;

  if (seedTopics && seedTopics.length > 0) {
    prompt += `

IMPORTANT: You have been provided with seed topics extracted from knowledge sources.
These should inform and guide the hierarchy structure. Incorporate these topics where appropriate:
${seedTopics.map(t => `- ${t}`).join('\n')}`;
  }

  return prompt;
}

interface TopicHierarchyResponse {
  hierarchy: Array<{
    name: string;
    description: string;
    children?: Array<{
      name: string;
      description: string;
      children?: Array<{
        name: string;
        description: string;
      }>;
    }>;
  }>;
}

const TOPIC_HIERARCHY_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'topic_hierarchy',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        hierarchy: {
          type: 'array',
          description: 'Root-level topics',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Topic name (lowercase_with_underscores)' },
              description: { type: 'string', description: 'Brief description of this topic' },
              children: {
                type: 'array',
                description: 'Child topics (optional)',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    children: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          description: { type: 'string' },
                        },
                        required: ['name', 'description'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['name', 'description'],
                  additionalProperties: false,
                },
              },
            },
            required: ['name', 'description'],
            additionalProperties: false,
          },
        },
      },
      required: ['hierarchy'],
      additionalProperties: false,
    },
  },
};

function buildUserPrompt(options: {
  records: DatasetRecord[];
  depth: number;
  degree: number;
  maxTopics: number;
  trainingGoals?: string;
  focus?: string;
  seedTopics?: string[];
}): string {
  const { records, depth, degree, maxTopics, trainingGoals, focus, seedTopics } = options;

  // Sample records for context (limit to avoid token overflow)
  const sampleRecords = records.slice(0, 10).map(r => {
    const data = r.data as Record<string, unknown>;
    return {
      input: typeof data.input === 'string' ? data.input.slice(0, 200) : JSON.stringify(data.input).slice(0, 200),
      output: typeof data.output === 'string' ? data.output?.slice(0, 100) : '',
    };
  });

  let prompt = `## Task
Generate a topic hierarchy for organizing training data.

## Parameters
- Maximum root topics: ${maxTopics}
- Hierarchy depth: ${depth} levels
- Branching factor: up to ${degree} children per topic`;

  if (trainingGoals) {
    prompt += `

## Training Goals
${trainingGoals}`;
  }

  if (focus) {
    prompt += `

## Focus Areas
${focus}`;
  }

  if (seedTopics && seedTopics.length > 0) {
    prompt += `

## Seed Topics (from uploaded documents)
Use these as guidance for the hierarchy structure:
${seedTopics.map(t => `- ${t}`).join('\n')}`;
  }

  if (sampleRecords.length > 0) {
    prompt += `

## Sample Records (for context)
${JSON.stringify(sampleRecords, null, 2)}`;
  }

  prompt += `

## Requirements
1. Create ${maxTopics} root topics maximum
2. Each topic can have up to ${degree} children
3. Go ${depth} levels deep when content warrants it
4. Topic names: lowercase_with_underscores (e.g., "opening_theory", "tactical_patterns")
5. Provide brief descriptions for each topic

Generate the topic hierarchy JSON:`;

  return prompt;
}

// =============================================================================
// LLM Call
// =============================================================================

async function callLLMForHierarchy(
  systemPrompt: string,
  userPrompt: string,
): Promise<TopicHierarchyResponse> {
  const lucyConfig = await fetchLucyConfigCached();
  const rawUrl = lucyConfig.distri_url || getDistriUrl();
  const baseUrl = `${rawUrl.replace(/\/$/, '')}/v1`;
  const distriClient = DistriClient.create({ baseUrl });

  const modelSettingsFromConfig = lucyConfig.model_settings || {};

  const messages: DistriMessage[] = [
    DistriClient.initDistriMessage('system', [{ part_type: 'text', data: systemPrompt }]),
    DistriClient.initDistriMessage('user', [{ part_type: 'text', data: userPrompt }]),
  ];

  const response = await distriClient.llm(messages, [], {
    model_settings: {
      ...modelSettingsFromConfig,
      model: modelSettingsFromConfig.model || 'openai/gpt-4.1',
      temperature: modelSettingsFromConfig.temperature ?? 0.3,
      response_format: TOPIC_HIERARCHY_SCHEMA,
    },
  });

  if (!response.content) {
    throw new Error('LLM returned empty response');
  }

  try {
    return JSON.parse(response.content.trim());
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.content.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }
    throw new Error('Failed to parse LLM response as JSON');
  }
}

// =============================================================================
// Convert Response to TopicHierarchyNode
// =============================================================================

let nodeIdCounter = 0;

function convertToHierarchyNodes(
  response: TopicHierarchyResponse,
): TopicHierarchyNode[] {
  nodeIdCounter = 0; // Reset for each conversion

  function convertNode(node: {
    name: string;
    description: string;
    children?: Array<{ name: string; description: string; children?: Array<{ name: string; description: string }> }>;
  }): TopicHierarchyNode {
    const result: TopicHierarchyNode = {
      id: `topic_${++nodeIdCounter}`,
      name: node.name.toLowerCase().replace(/\s+/g, '_'),
    };
    if (node.children && node.children.length > 0) {
      result.children = node.children.map(convertNode);
    }
    return result;
  }

  return response.hierarchy.map(convertNode);
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Generate topic hierarchy using frontend LLM calls
 *
 * @param options - Generation options including seed topics, focus, etc.
 */
export async function generateTopicsViaFrontend(
  datasetId: string,
  depth: number,
  degree: number,
  maxTopics?: number,
  trainingGoals?: string,
  focus?: string,
  seedTopics?: string[],
): Promise<GenerateTopicsResult> {
  try {
    // Get records for context
    const records = await datasetsDB.getRecordsByDatasetId(datasetId);

    const effectiveMaxTopics = maxTopics || 3;

    // Build prompts
    const systemPrompt = buildSystemPrompt(seedTopics);
    const userPrompt = buildUserPrompt({
      records,
      depth,
      degree,
      maxTopics: effectiveMaxTopics,
      trainingGoals,
      focus,
      seedTopics,
    });

    console.log('[generateTopicsViaFrontend] Calling LLM with:', {
      recordCount: records.length,
      depth,
      degree,
      maxTopics: effectiveMaxTopics,
      hasSeedTopics: !!seedTopics?.length,
      seedTopicsCount: seedTopics?.length || 0,
    });

    // Call LLM
    const response = await callLLMForHierarchy(systemPrompt, userPrompt);

    // Convert to hierarchy nodes
    const hierarchy = convertToHierarchyNodes(response);

    console.log('[generateTopicsViaFrontend] Generated hierarchy:', {
      rootTopics: hierarchy.length,
      totalNodes: countNodes(hierarchy),
    });

    return { success: true, hierarchy };
  } catch (error) {
    console.error('[generateTopicsViaFrontend] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate topics',
    };
  }
}

function countNodes(nodes: TopicHierarchyNode[]): number {
  let count = nodes.length;
  for (const node of nodes) {
    if (node.children) {
      count += countNodes(node.children);
    }
  }
  return count;
}
