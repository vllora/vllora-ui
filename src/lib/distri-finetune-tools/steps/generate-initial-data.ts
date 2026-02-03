/**
 * Generate Initial Data Tool
 *
 * Generates initial seed records for empty datasets using only the training objective.
 * This enables data generation when no existing records exist to build upon.
 */

import type { DistriFnTool } from '@distri/core';
import { DistriClient, type DistriMessage } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import { getDistriUrl } from '@/config/api';
import { fetchLucyConfig, type LucyConfig } from '@/lib/agent-sync';
import type { ToolHandler } from '../types';
import type { DataInfo } from '@/types/dataset-types';

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

interface GenerateInitialDataParams {
  dataset_id: string;
  count?: number;
  generation_mode?: 'rft' | 'sft';
  /** Optional user guidance for how to generate the data (e.g., "focus on beginner concepts", "include edge cases") */
  user_guidance?: string;
}

interface GeneratedExample {
  system_prompt: string;
  user_message: string;
  assistant_response?: string;
}

interface GenerateInitialDataResult {
  success: boolean;
  error?: string;
  dataset_name?: string;
  records_created?: number;
  training_objective?: string;
}

// =============================================================================
// Prompts
// =============================================================================

const INITIAL_DATA_GENERATION_SYSTEM = `You are an expert at creating high-quality training data for LLM fine-tuning.
Your task is to generate diverse, realistic conversation examples based on a training objective.

Rules:
- Generate examples that directly align with the training objective
- Each example should have a clear, specific scenario
- User messages should be natural and varied in style
- For SFT mode, include helpful assistant responses
- For RFT mode, only generate the user prompt (assistant learns through reinforcement)
- Vary the complexity, length, and style across examples
- Include edge cases and challenging scenarios
- Output MUST be valid JSON matching the schema`;

const INITIAL_DATA_GENERATION_USER_RFT = `Generate {{count}} diverse training examples for the following objective:

Training Objective:
{{objective}}
{{user_guidance}}
Generate a JSON array of examples. Each example should be a realistic user query/prompt that would be sent to an AI assistant being trained for this objective.

For each example, provide:
- system_prompt: A concise system prompt that defines the assistant's role for this specific scenario
- user_message: A realistic user message/query

Make the examples diverse in:
- Complexity (simple to complex queries)
- Length (brief to detailed)
- Tone (formal, casual, technical)
- Scenario type (different aspects of the objective)

Output Format:
{
  "examples": [
    {
      "system_prompt": "You are a helpful assistant that...",
      "user_message": "User's question or request..."
    },
    ...
  ]
}

Generate exactly {{count}} examples.`;

const INITIAL_DATA_GENERATION_USER_SFT = `Generate {{count}} diverse training examples for the following objective:

Training Objective:
{{objective}}
{{user_guidance}}
Generate a JSON array of complete conversation examples. Each example should demonstrate the ideal assistant behavior for this objective.

For each example, provide:
- system_prompt: A concise system prompt that defines the assistant's role for this specific scenario
- user_message: A realistic user message/query
- assistant_response: An ideal, helpful response from the assistant

Make the examples diverse in:
- Complexity (simple to complex queries)
- Length (brief to detailed)
- Tone (formal, casual, technical)
- Scenario type (different aspects of the objective)

Output Format:
{
  "examples": [
    {
      "system_prompt": "You are a helpful assistant that...",
      "user_message": "User's question or request...",
      "assistant_response": "Helpful and accurate response..."
    },
    ...
  ]
}

Generate exactly {{count}} examples.`;

const INITIAL_DATA_RESPONSE_SCHEMA_RFT = {
  type: 'json_schema',
  json_schema: {
    name: 'initial_training_data_rft',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        examples: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              system_prompt: { type: 'string' },
              user_message: { type: 'string' },
            },
            required: ['system_prompt', 'user_message'],
            additionalProperties: false,
          },
        },
      },
      required: ['examples'],
      additionalProperties: false,
    },
  },
};

const INITIAL_DATA_RESPONSE_SCHEMA_SFT = {
  type: 'json_schema',
  json_schema: {
    name: 'initial_training_data_sft',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        examples: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              system_prompt: { type: 'string' },
              user_message: { type: 'string' },
              assistant_response: { type: 'string' },
            },
            required: ['system_prompt', 'user_message', 'assistant_response'],
            additionalProperties: false,
          },
        },
      },
      required: ['examples'],
      additionalProperties: false,
    },
  },
};

// =============================================================================
// LLM Call
// =============================================================================

async function callLLMForInitialData(
  objective: string,
  count: number,
  mode: 'rft' | 'sft',
  userGuidance?: string
): Promise<GeneratedExample[]> {
  const lucyConfig = await fetchLucyConfigCached();
  const rawUrl = lucyConfig.distri_url || getDistriUrl();
  const baseUrl = `${rawUrl.replace(/\/$/, '')}/v1`;
  const distriClient = DistriClient.create({ baseUrl });

  const modelSettingsFromConfig = lucyConfig.model_settings || {};

  const userPromptTemplate = mode === 'rft'
    ? INITIAL_DATA_GENERATION_USER_RFT
    : INITIAL_DATA_GENERATION_USER_SFT;

  // Build user guidance section if provided
  const guidanceSection = userGuidance
    ? `\nUser's specific guidance:\n${userGuidance}\n`
    : '';

  const userPrompt = userPromptTemplate
    .replace(/\{\{count\}\}/g, String(count))
    .replace('{{objective}}', objective)
    .replace('{{user_guidance}}', guidanceSection);

  const responseSchema = mode === 'rft'
    ? INITIAL_DATA_RESPONSE_SCHEMA_RFT
    : INITIAL_DATA_RESPONSE_SCHEMA_SFT;

  const messages: DistriMessage[] = [
    DistriClient.initDistriMessage('system', [{ part_type: 'text', data: INITIAL_DATA_GENERATION_SYSTEM }]),
    DistriClient.initDistriMessage('user', [{ part_type: 'text', data: userPrompt }]),
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await distriClient.llm(messages, [], {
        model_settings: {
          ...modelSettingsFromConfig,
          model: modelSettingsFromConfig.model || 'openai/gpt-4.1',
          temperature: modelSettingsFromConfig.temperature ?? 0.7,
          response_format: responseSchema,
        },
      });

      if (!response.content) {
        throw new Error('LLM returned empty response');
      }

      const parsed = JSON.parse(response.content.trim());
      return parsed.examples || [];
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        const backoffMs = 800 * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('LLM call failed');
}

// =============================================================================
// Convert to DatasetRecord format
// =============================================================================

function exampleToDataInfo(example: GeneratedExample, mode: 'rft' | 'sft'): DataInfo {
  const inputMessages = [
    { role: 'system' as const, content: example.system_prompt },
    { role: 'user' as const, content: example.user_message },
  ];

  if (mode === 'sft' && example.assistant_response) {
    return {
      input: {
        messages: inputMessages,
        tools: [],
      },
      output: {
        messages: [{ role: 'assistant' as const, content: example.assistant_response }],
        finish_reason: 'stop',
      },
    };
  }

  // RFT mode: empty output for rollout
  return {
    input: {
      messages: inputMessages,
      tools: [],
    },
    output: {
      messages: undefined,
      finish_reason: undefined,
    },
  };
}

// =============================================================================
// Main Handler
// =============================================================================

export const generateInitialDataHandler: ToolHandler = async (params): Promise<GenerateInitialDataResult> => {
  try {
    console.log('[generateInitialData] Starting with params:', JSON.stringify(params, null, 2));

    const {
      dataset_id,
      count = 10,
      generation_mode = 'rft',
      user_guidance,
    } = params as unknown as GenerateInitialDataParams;

    if (!dataset_id) {
      return { success: false, error: 'dataset_id is required' };
    }

    // Get dataset
    const dataset = await datasetsDB.getDatasetById(dataset_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${dataset_id} not found` };
    }

    // Get training objective
    const objective = dataset.datasetObjective;
    if (!objective || !objective.trim()) {
      return {
        success: false,
        error: 'Dataset has no training objective defined. Please set a training objective first.',
      };
    }

    console.log('[generateInitialData] Generating data for objective:', objective.substring(0, 100) + '...');
    console.log('[generateInitialData] Count:', count, 'Mode:', generation_mode);
    if (user_guidance) {
      console.log('[generateInitialData] User guidance:', user_guidance.substring(0, 100) + '...');
    }

    // Generate examples using LLM
    const examples = await callLLMForInitialData(objective, count, generation_mode, user_guidance);
    console.log('[generateInitialData] Generated', examples.length, 'examples');

    // Convert to dataset records and save (without topics - user can define topics later)
    const recordsToAdd = examples.map(example => ({
      data: exampleToDataInfo(example, generation_mode),
      is_generated: true,
      metadata: {
        generation_source: 'initial_data',
        generation_mode,
        generated_at_ms: Date.now(),
      },
    }));

    const addedRecords = await datasetsDB.addRecordsToDataset(dataset_id, recordsToAdd);
    console.log('[generateInitialData] Added', addedRecords.length, 'records to dataset');

    return {
      success: true,
      dataset_name: dataset.name,
      records_created: addedRecords.length,
      training_objective: objective,
    };
  } catch (error) {
    console.error('[generateInitialData] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate initial data',
    };
  }
};

export const generateInitialDataTool: DistriFnTool = {
  name: 'generate_initial_data',
  description: `Generate initial seed records for an empty dataset based on the training objective.

Use this tool when:
- A dataset has no records yet
- You need to bootstrap the dataset with initial training examples
- The dataset has a training objective defined but no seed data

This tool generates diverse training examples based on the dataset's training objective.
You can optionally provide user guidance to focus the generation on specific aspects.
Generated records can then be used as seeds for further data generation or topic analysis.

**Generation Modes:**
- RFT (default): Generates prompts only (empty output for reinforcement learning rollouts)
- SFT: Generates complete conversations with assistant responses

**User Guidance:**
Pass the user's specific instructions if they mentioned what kind of data they want.
Examples: "focus on beginner concepts", "include edge cases", "emphasize error handling scenarios"`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID to generate initial data for',
      },
      count: {
        type: 'number',
        default: 10,
        description: 'Number of initial records to generate (default: 10)',
      },
      generation_mode: {
        type: 'string',
        enum: ['rft', 'sft'],
        default: 'rft',
        description: 'Generation mode: "rft" for prompts only, "sft" for complete conversations',
      },
      user_guidance: {
        type: 'string',
        description: 'Optional user guidance for data generation (e.g., "focus on beginner concepts", "include edge cases")',
      },
    },
    required: ['dataset_id'],
  },
  autoExecute: true,
  handler: async (input) => JSON.stringify(await generateInitialDataHandler(input as Record<string, unknown>)),
} as DistriFnTool;
