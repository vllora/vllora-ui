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
import {
  buildKnowledgeContext,
  DOCUMENT_DERIVED_TOPICS_INSTRUCTION,
} from '../shared/knowledge-context';

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

function buildSystemPrompt(hasKnowledgeSources: boolean): string {
  let prompt = `You are a hierarchical topic builder for training datasets.

Goal: Generate a topic hierarchy that will be used to organize and generate training data.

Rules:
- Topic names must be lowercase_with_underscores
- Create a balanced tree structure with the requested depth and branching
- Topics should be specific and actionable, not generic
- Output MUST be valid JSON matching the schema (no markdown, no code fences)`;

  if (hasKnowledgeSources) {
    prompt += `

${DOCUMENT_DERIVED_TOPICS_INSTRUCTION}`;
  }

  return prompt;
}

interface TopicHierarchyResponse {
  hierarchy: Array<{
    name: string;
    description: string;
    source_chunks: string[];
    children?: Array<{
      name: string;
      description: string;
      source_chunks: string[];
      children?: Array<{
        name: string;
        description: string;
        source_chunks: string[];
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
              source_chunks: {
                type: 'array',
                description: 'Ref tags from knowledge sources relevant to this topic (e.g., ["abc:chunk-1"])',
                items: { type: 'string' },
              },
              children: {
                type: 'array',
                description: 'Child topics (optional)',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    source_chunks: {
                      type: 'array',
                      description: 'Ref tags from knowledge sources relevant to this topic',
                      items: { type: 'string' },
                    },
                    children: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          description: { type: 'string' },
                          source_chunks: {
                            type: 'array',
                            description: 'Ref tags from knowledge sources relevant to this topic',
                            items: { type: 'string' },
                          },
                        },
                        required: ['name', 'description', 'source_chunks'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['name', 'description', 'source_chunks', 'children'],
                  additionalProperties: false,
                },
              },
            },
            required: ['name', 'description', 'source_chunks', 'children'],
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
  knowledgeContext?: string;
}): string {
  const { records, depth, degree, maxTopics, trainingGoals, focus, knowledgeContext } = options;

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

  // Add rich knowledge context if available
  if (knowledgeContext) {
    prompt += `

## UPLOADED KNOWLEDGE SOURCES (BASE YOUR TOPICS ON THESE)

${knowledgeContext}

**IMPORTANT**: Your topics MUST be derived from the topics and sections listed above. Do NOT create generic topics - use the SPECIFIC content from these documents.`;
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
${knowledgeContext ? `6. Topics MUST reflect the ACTUAL CONTENT of uploaded documents
7. For each topic, include the source_chunks array with the [ref:...] IDs from the knowledge sources above that are most relevant to that topic. Return [] if no refs apply.` : ''}

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
    source_chunks?: string[];
    children?: Array<{ name: string; description: string; source_chunks?: string[]; children?: Array<{ name: string; description: string; source_chunks?: string[] }> }>;
  }): TopicHierarchyNode {
    const result: TopicHierarchyNode = {
      id: `topic_${++nodeIdCounter}`,
      name: node.name.toLowerCase().replace(/\s+/g, '_'),
      description: node.description || undefined,
      sourceChunkRefs: node.source_chunks?.length ? node.source_chunks : undefined,
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
  _seedTopics?: string[], // Deprecated: now using rich knowledge context instead
): Promise<GenerateTopicsResult> {
  try {
    // Get records for context
    const records = await datasetsDB.getRecordsByDatasetId(datasetId);

    // Build rich knowledge context using shared module
    const knowledgeCtx = await buildKnowledgeContext(datasetId);
    const hasKnowledgeSources = knowledgeCtx.readyCount > 0;

    const effectiveMaxTopics = maxTopics || 3;

    // Build prompts with rich knowledge context
    const systemPrompt = buildSystemPrompt(hasKnowledgeSources);
    const userPrompt = buildUserPrompt({
      records,
      depth,
      degree,
      maxTopics: effectiveMaxTopics,
      trainingGoals,
      focus,
      knowledgeContext: knowledgeCtx.contextString || undefined,
    });

    console.log('[generateTopicsViaFrontend] Calling LLM with:', {
      recordCount: records.length,
      depth,
      degree,
      maxTopics: effectiveMaxTopics,
      hasKnowledgeSources,
      knowledgeSourcesCount: knowledgeCtx.readyCount,
      extractedTopicsCount: knowledgeCtx.allSectionHeadings.length,
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
