/**
 * Generate Preview Tool
 *
 * Generates a small batch of preview samples for user review before
 * committing to a larger batch generation. Supports the interactive
 * preview → feedback → iterate workflow.
 */

import type { DistriFnTool } from '@distri/core';
import { DistriClient, type DistriMessage } from '@distri/core';
import { datasetService } from '@/services/service-registry';
import { getDistriUrl } from '@/config/api';
import { fetchLucyConfig, type LucyConfig } from '@/lib/agent-sync';
import { resolveChunkRefs, buildChunkContextSection } from './shared/chunk-lookup';
import { buildKnowledgeContext } from './shared/knowledge-context';
import type { TopicHierarchyNode } from '@/types/dataset-types';
import type { ToolHandler } from '../types';

// Cache for Lucy config
let cachedLucyConfig: LucyConfig | null = null;
const fetchLucyConfigCached = async (): Promise<LucyConfig> => {
  if (cachedLucyConfig) return cachedLucyConfig;
  cachedLucyConfig = await fetchLucyConfig();
  return cachedLucyConfig;
};

// =============================================================================
// Types
// =============================================================================

interface GeneratePreviewParams {
  workflow_id: string;
  count?: number;
  topic?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  style?: 'formal' | 'casual' | 'technical';
  guidance?: string;
  use_knowledge?: boolean;
}

interface PreviewRecord {
  system_prompt: string;
  user_message: string;
  topic?: string;
  source_reference?: string;
}

interface GeneratePreviewResult {
  success: boolean;
  error?: string;
  previews?: PreviewRecord[];
  metadata?: {
    dataset_name: string;
    objective: string;
    knowledge_sources_used: string[];
    generation_params: {
      count: number;
      topic?: string;
      difficulty?: string;
      style?: string;
    };
  };
}

// =============================================================================
// Prompts
// =============================================================================

const PREVIEW_GENERATION_SYSTEM = `You are an expert at creating high-quality training data for LLM fine-tuning.
Your task is to generate diverse, realistic conversation examples that will be used to preview before full batch generation.

Rules:
- Generate examples that directly align with the training objective
- Each example should be distinct and cover different aspects
- Vary the complexity based on the specified difficulty level
- Match the specified style (formal, casual, technical)
- If knowledge context is provided, ground examples in that content
- Output MUST be valid JSON matching the schema`;

const PREVIEW_GENERATION_USER = `Generate {{count}} preview training examples for review.

Training Objective:
{{objective}}

{{topic_section}}
{{difficulty_section}}
{{style_section}}
{{guidance_section}}
{{knowledge_section}}

Generate diverse examples that demonstrate the range of training data that would be created.
Each example should be meaningfully different.

Output Format:
{
  "previews": [
    {
      "system_prompt": "Concise system prompt for this scenario...",
      "user_message": "Realistic user question or request..."{{source_ref_field}}
    }
  ]
}

Generate exactly {{count}} preview examples.`;

const PREVIEW_RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'preview_records',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        previews: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              system_prompt: { type: 'string' },
              user_message: { type: 'string' },
              source_reference: { type: 'string' },
            },
            required: ['system_prompt', 'user_message', 'source_reference'],
            additionalProperties: false,
          },
        },
      },
      required: ['previews'],
      additionalProperties: false,
    },
  },
};

// =============================================================================
// LLM Call
// =============================================================================

async function callLLMForPreview(
  objective: string,
  count: number,
  options: {
    topic?: string;
    difficulty?: string;
    style?: string;
    guidance?: string;
    knowledgeContext?: string;
  }
): Promise<PreviewRecord[]> {
  const lucyConfig = await fetchLucyConfigCached();
  const rawUrl = lucyConfig.distri_url || getDistriUrl();
  const baseUrl = `${rawUrl.replace(/\/$/, '')}/v1`;
  const distriClient = DistriClient.create({ baseUrl });

  const modelSettingsFromConfig = lucyConfig.model_settings || {};

  // Build prompt sections
  const topicSection = options.topic
    ? `Target Topic: ${options.topic}\nFocus examples on this specific topic.`
    : '';

  const difficultySection = options.difficulty
    ? `Difficulty Level: ${options.difficulty}\n- beginner: Simple, foundational concepts\n- intermediate: More nuanced, requires some background\n- advanced: Complex scenarios, expert-level queries`
    : '';

  const styleSection = options.style
    ? `Communication Style: ${options.style}\n- formal: Professional, structured\n- casual: Friendly, conversational\n- technical: Precise, domain-specific terminology`
    : '';

  const guidanceSection = options.guidance
    ? `Additional Guidance:\n${options.guidance}`
    : '';

  const knowledgeSection = options.knowledgeContext
    ? `Knowledge Context (use this to ground examples):\n${options.knowledgeContext}`
    : '';

  const sourceRefField = options.knowledgeContext
    ? `,\n      "source_reference": "Optional: cite the source if grounded in knowledge"`
    : '';

  const userPrompt = PREVIEW_GENERATION_USER
    .replace(/\{\{count\}\}/g, String(count))
    .replace('{{objective}}', objective)
    .replace('{{topic_section}}', topicSection)
    .replace('{{difficulty_section}}', difficultySection)
    .replace('{{style_section}}', styleSection)
    .replace('{{guidance_section}}', guidanceSection)
    .replace('{{knowledge_section}}', knowledgeSection)
    .replace('{{source_ref_field}}', sourceRefField);

  const messages: DistriMessage[] = [
    DistriClient.initDistriMessage('system', [
      { part_type: 'text', data: PREVIEW_GENERATION_SYSTEM },
    ]),
    DistriClient.initDistriMessage('user', [
      { part_type: 'text', data: userPrompt },
    ]),
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await distriClient.llm(messages, [], {
        model_settings: {
          ...modelSettingsFromConfig,
          model: modelSettingsFromConfig.model || 'openai/gpt-4.1',
          temperature: modelSettingsFromConfig.temperature ?? 0.8,
          response_format: PREVIEW_RESPONSE_SCHEMA,
        },
      });

      if (!response.content) {
        throw new Error('LLM returned empty response');
      }

      const parsed = JSON.parse(response.content.trim());
      return parsed.previews || [];
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        const backoffMs = 800 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('LLM call failed');
}

// =============================================================================
// Helpers
// =============================================================================

/** Find a topic node in the hierarchy by name (case-insensitive match) */
function findTopicNodeByName(
  nodes: TopicHierarchyNode[],
  name: string,
): TopicHierarchyNode | null {
  for (const node of nodes) {
    if (node.name.toLowerCase() === name.toLowerCase()) return node;
    if (node.children?.length) {
      const found = findTopicNodeByName(node.children, name);
      if (found) return found;
    }
  }
  return null;
}

// =============================================================================
// Main Handler
// =============================================================================

export const generatePreviewHandler: ToolHandler = async (
  params
): Promise<GeneratePreviewResult> => {
  try {
    console.log(
      '[generatePreview] Starting with params:',
      JSON.stringify(params, null, 2)
    );

    const {
      workflow_id,
      count = 3,
      topic,
      difficulty,
      style,
      guidance,
      use_knowledge = true,
    } = params as unknown as GeneratePreviewParams;

    if (!workflow_id) {
      return { success: false, error: 'workflow_id is required' };
    }

    // Get dataset
    const dataset = await datasetService.getById(workflow_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${workflow_id} not found` };
    }

    // Get training objective
    const objective = dataset.datasetObjective;
    if (!objective || !objective.trim()) {
      return {
        success: false,
        error: 'Dataset has no training objective defined. Please set a training objective first.',
      };
    }

    // Get knowledge context if enabled — chunk-aware resolution
    let knowledgeContext: string | undefined;
    const knowledgeSourcesUsed: string[] = [];

    if (use_knowledge) {
      // Strategy 1: If topic is specified and hierarchy has sourceChunkRefs, resolve topic-specific chunks
      if (topic && dataset.topicHierarchy?.hierarchy?.length) {
        const topicNode = findTopicNodeByName(dataset.topicHierarchy.hierarchy, topic);
        if (topicNode?.sourceChunkRefs?.length) {
          try {
            const resolvedChunks = await resolveChunkRefs(workflow_id, topicNode.sourceChunkRefs);
            if (resolvedChunks.length > 0) {
              knowledgeContext = buildChunkContextSection(resolvedChunks);
              // Collect unique source names
              const sourceNames = new Set(resolvedChunks.map(c => c.sourceName));
              knowledgeSourcesUsed.push(...sourceNames);
            }
          } catch (err) {
            console.warn('[generatePreview] Failed to resolve topic chunks, falling back:', err);
          }
        }
      }

      // Strategy 2: Fallback to structured knowledge context (full sources)
      if (!knowledgeContext) {
        try {
          const knowledgeCtx = await buildKnowledgeContext(workflow_id);
          if (knowledgeCtx.readyCount > 0 && knowledgeCtx.contextString) {
            knowledgeContext = knowledgeCtx.contextString;
            knowledgeSourcesUsed.push(...knowledgeCtx.sourcesSummary.map(s => s.name));
          }
        } catch (err) {
          console.warn('[generatePreview] Failed to build knowledge context:', err);
        }
      }
    }

    console.log('[generatePreview] Generating', count, 'preview examples');

    // Generate previews
    const previews = await callLLMForPreview(objective, Math.min(count, 5), {
      topic,
      difficulty,
      style,
      guidance,
      knowledgeContext,
    });

    // Add topic to previews if specified
    const previewsWithTopic = previews.map((p) => ({
      ...p,
      topic: topic || undefined,
    }));

    console.log('[generatePreview] Generated', previews.length, 'previews');

    return {
      success: true,
      previews: previewsWithTopic,
      metadata: {
        dataset_name: dataset.name,
        objective,
        knowledge_sources_used: knowledgeSourcesUsed,
        generation_params: {
          count: Math.min(count, 5),
          topic,
          difficulty,
          style,
        },
      },
    };
  } catch (error) {
    console.error('[generatePreview] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate previews',
    };
  }
};

// =============================================================================
// Tool Definition
// =============================================================================

export const generatePreviewTool: DistriFnTool = {
  name: 'generate_preview',
  description: `Generate preview samples for user review before batch generation.

Use this tool to:
- Show users 3-5 sample records before committing to larger generation
- Get user feedback on style, difficulty, and content
- Iterate on generation parameters before batch processing

The preview workflow is:
1. Generate preview (this tool)
2. User reviews and provides feedback
3. Adjust parameters based on feedback
4. Repeat until satisfied
5. Use generate_batch for full generation

Preview generation is fast and allows interactive refinement.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The dataset ID to generate previews for',
      },
      count: {
        type: 'number',
        default: 3,
        description: 'Number of preview samples (1-5, default: 3)',
      },
      topic: {
        type: 'string',
        description: 'Optional: Focus previews on a specific topic',
      },
      difficulty: {
        type: 'string',
        enum: ['beginner', 'intermediate', 'advanced'],
        description: 'Optional: Target difficulty level',
      },
      style: {
        type: 'string',
        enum: ['formal', 'casual', 'technical'],
        description: 'Optional: Communication style',
      },
      guidance: {
        type: 'string',
        description: 'Optional: Additional guidance for generation (e.g., "focus on edge cases")',
      },
      use_knowledge: {
        type: 'boolean',
        default: true,
        description: 'Whether to use uploaded knowledge sources for grounding (default: true)',
      },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await generatePreviewHandler(input as Record<string, unknown>)),
} as DistriFnTool;
