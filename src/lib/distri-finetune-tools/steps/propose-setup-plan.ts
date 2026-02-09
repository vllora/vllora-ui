/**
 * Propose Setup Plan Tool
 *
 * Analyzes dataset objective and knowledge sources to propose a complete
 * setup plan for first-time users. The plan includes topic hierarchy,
 * data generation strategy, grader configuration, and execution steps.
 *
 * This is the first step in the guided onboarding flow.
 */

import type { DistriFnTool } from '@distri/core';
import { DistriClient, type DistriMessage } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import * as knowledgeDB from '@/services/knowledge-sources-db';
import { getDistriUrl } from '@/config/api';
import { fetchLucyConfig, type LucyConfig } from '@/lib/agent-sync';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

// =============================================================================
// Types
// =============================================================================

interface ProposeSetupPlanParams {
  dataset_id: string;
  seed_count?: number;
}

interface ProposedTopic {
  name: string;
  description: string;
  target_count: number;
  subtopics?: ProposedTopic[];
}

interface GraderCriterion {
  name: string;
  description: string;
  weight: number;
}

export interface SetupPlan {
  dataset_id: string;
  dataset_name: string;
  objective: string;

  // Knowledge sources analysis
  knowledge_sources: {
    name: string;
    topics_extracted: string[];
  }[];

  // Proposed topic hierarchy
  proposed_topics: ProposedTopic[];
  total_topic_count: number;

  // Data generation plan
  data_generation: {
    seed_count: number;
    strategy: string;
    grounded_in_knowledge: boolean;
  };

  // Grader configuration
  grader_config: {
    criteria: GraderCriterion[];
    passing_threshold: number;
    template_preview: string;
  };

  // Execution steps
  execution_steps: {
    step: string;
    description: string;
    estimated_time: string;
  }[];

  // Estimated totals
  estimated_records: number;
  estimated_duration: string;
}

interface ProposeSetupPlanResult {
  success: boolean;
  error?: string;
  plan?: SetupPlan;
  requires_knowledge_sources?: boolean;
  sources_processing?: boolean;
  message?: string;
}

// =============================================================================
// Cache for Lucy config
// =============================================================================

let cachedLucyConfig: LucyConfig | null = null;
const fetchLucyConfigCached = async (): Promise<LucyConfig> => {
  if (cachedLucyConfig) return cachedLucyConfig;
  cachedLucyConfig = await fetchLucyConfig();
  return cachedLucyConfig;
};

// =============================================================================
// Prompts
// =============================================================================

const PLAN_GENERATION_SYSTEM = `You are an expert at designing fine-tuning workflows for LLMs.
Your task is to create a comprehensive setup plan based on the training objective and available knowledge sources.

Rules:
- Create a balanced topic hierarchy based on the objective and knowledge
- Topics should be specific enough to generate focused training data
- Aim for 4-8 top-level topics with 2-4 subtopics each where appropriate
- IMPORTANT: Each top-level topic should have target_count of 30-50 examples minimum
- IMPORTANT: Each subtopic should have target_count of 15-25 examples minimum
- High-quality fine-tuning requires substantial training data (100+ examples total)
- Grader criteria should be specific to the domain
- Be realistic about what can be achieved with the available knowledge
- Output MUST be valid JSON matching the schema`;

const PLAN_GENERATION_USER = `Create a setup plan for fine-tuning a model.

Training Objective:
{{objective}}

{{knowledge_section}}

Create a comprehensive plan including:
1. Topic hierarchy (organized categories for training data)
2. Data generation strategy (how many examples per topic)
3. Evaluation criteria (how to grade model responses)

IMPORTANT: Each topic should have at least 30-50 examples. Subtopics should have at least 15-25 examples each.
High-quality fine-tuning requires substantial training data.

Target seed count: {{seed_count}} initial examples

Output Format:
{
  "proposed_topics": [
    {
      "name": "Topic Name",
      "description": "What this topic covers",
      "target_count": 40,
      "subtopics": [
        {
          "name": "Subtopic Name",
          "description": "Subtopic description",
          "target_count": 20
        }
      ]
    }
  ],
  "grader_criteria": [
    {
      "name": "Criterion Name",
      "description": "What this evaluates",
      "weight": 0.3
    }
  ],
  "strategy_notes": "Brief explanation of the approach"
}`;

const PLAN_RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'setup_plan',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        proposed_topics: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              target_count: { type: 'number' },
              subtopics: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    target_count: { type: 'number' },
                  },
                  required: ['name', 'description', 'target_count'],
                  additionalProperties: false,
                },
              },
            },
            required: ['name', 'description', 'target_count', 'subtopics'],
            additionalProperties: false,
          },
        },
        grader_criteria: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              weight: { type: 'number' },
            },
            required: ['name', 'description', 'weight'],
            additionalProperties: false,
          },
        },
        strategy_notes: { type: 'string' },
      },
      required: ['proposed_topics', 'grader_criteria', 'strategy_notes'],
      additionalProperties: false,
    },
  },
};

// =============================================================================
// LLM Call
// =============================================================================

async function callLLMForPlan(
  objective: string,
  seedCount: number,
  knowledgeContext?: string
): Promise<{
  proposed_topics: ProposedTopic[];
  grader_criteria: GraderCriterion[];
  strategy_notes: string;
}> {
  const lucyConfig = await fetchLucyConfigCached();
  const rawUrl = lucyConfig.distri_url || getDistriUrl();
  const baseUrl = `${rawUrl.replace(/\/$/, '')}/v1`;
  const distriClient = DistriClient.create({ baseUrl });

  const modelSettingsFromConfig = lucyConfig.model_settings || {};

  const knowledgeSection = knowledgeContext
    ? `Available Knowledge Sources:\n${knowledgeContext}\n\nUse these to inform topic categories and ensure grounded content.`
    : 'No knowledge sources uploaded. Create a general topic structure based on the objective.';

  const userPrompt = PLAN_GENERATION_USER
    .replace('{{objective}}', objective)
    .replace('{{knowledge_section}}', knowledgeSection)
    .replace('{{seed_count}}', String(seedCount));

  const messages: DistriMessage[] = [
    DistriClient.initDistriMessage('system', [
      { part_type: 'text', data: PLAN_GENERATION_SYSTEM },
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
          temperature: modelSettingsFromConfig.temperature ?? 0.7,
          response_format: PLAN_RESPONSE_SCHEMA,
        },
      });

      if (!response.content) {
        throw new Error('LLM returned empty response');
      }

      return JSON.parse(response.content.trim());
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
// Grader Template Generation
// =============================================================================

function generateGraderTemplate(criteria: GraderCriterion[], objective: string): string {
  const criteriaList = criteria
    .map((c, i) => `${i + 1}. ${c.name} (${Math.round(c.weight * 100)}%): ${c.description}`)
    .join('\n');

  return `/**
 * Evaluation grader for: ${objective}
 *
 * Criteria:
${criteriaList}
 */

async function evaluate(response, context) {
  const { messages, expected } = context;
  const userMessage = messages.find(m => m.role === 'user')?.content || '';

  // Use LLM to evaluate against criteria
  const evaluation = await llmJudge({
    response,
    userMessage,
    criteria: [
${criteria.map(c => `      { name: "${c.name}", weight: ${c.weight}, description: "${c.description}" }`).join(',\n')}
    ]
  });

  return {
    score: evaluation.overallScore,
    passed: evaluation.overallScore >= 0.7,
    feedback: evaluation.feedback,
    criteria_scores: evaluation.criteriaScores
  };
}`;
}

// =============================================================================
// Main Handler
// =============================================================================

export const proposeSetupPlanHandler: ToolHandler = async (
  params
): Promise<ProposeSetupPlanResult> => {
  try {
    console.log('[proposeSetupPlan] Starting with params:', JSON.stringify(params, null, 2));

    const { dataset_id, seed_count = 30 } = params as unknown as ProposeSetupPlanParams;

    if (!dataset_id) {
      return { success: false, error: 'dataset_id is required' };
    }

    // Emit event so right panel shows loading state
    emitter.emit('vllora_setup_plan_generating', { datasetId: dataset_id });

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
        error: 'Dataset has no training objective. Please set a training objective first.',
        message: 'Before I can create a setup plan, I need to know what you want to train the model to do. Could you describe your training objective?',
      };
    }

    // Get knowledge sources
    const sources = await knowledgeDB.getKnowledgeSourcesByDataset(dataset_id);
    const readySources = sources.filter((s) => s.status === 'ready');
    const processingSources = sources.filter((s) => s.status === 'processing');

    // Build knowledge context
    let knowledgeContext: string | undefined;
    const knowledgeSourcesSummary: { name: string; topics_extracted: string[] }[] = [];

    if (readySources.length > 0) {
      const contextParts: string[] = [];
      for (const source of readySources) {
        const topics = source.extractedContent?.topics || [];
        knowledgeSourcesSummary.push({
          name: source.name,
          topics_extracted: topics,
        });

        if (source.extractedContent?.text) {
          contextParts.push(
            `[${source.name}]:\nTopics: ${topics.join(', ')}\nContent: ${source.extractedContent.text.substring(0, 1500)}...`
          );
        }
      }
      if (contextParts.length > 0) {
        knowledgeContext = contextParts.join('\n\n---\n\n');
      }
    }

    // If no ready sources but some are still processing, ask user to wait
    if (readySources.length === 0 && processingSources.length > 0) {
      const processingNames = processingSources.map((s) => s.name).join(', ');
      return {
        success: true,
        requires_knowledge_sources: true,
        sources_processing: true,
        message: `Your documents are still being processed: ${processingNames}\n\nPlease wait a moment for processing to complete, then try again. This usually takes about 30-60 seconds per document.`,
        plan: undefined,
      };
    }

    // If no knowledge sources at all, suggest uploading
    if (readySources.length === 0) {
      return {
        success: true,
        requires_knowledge_sources: true,
        message: `I can see you want to train a model for: "${objective}"\n\nTo create the best setup plan, I recommend uploading some reference documents (PDFs, text files) that contain the knowledge you want the model to learn from.\n\nYou can drag & drop files here, or click the attachment button.\n\nAlternatively, I can create a general plan without specific knowledge sources - just let me know!`,
        plan: undefined,
      };
    }

    console.log('[proposeSetupPlan] Generating plan with', readySources.length, 'knowledge sources');

    // Call LLM to generate plan
    const llmResult = await callLLMForPlan(objective, seed_count, knowledgeContext);

    // Count total topics
    let totalTopicCount = llmResult.proposed_topics.length;
    for (const topic of llmResult.proposed_topics) {
      if (topic.subtopics) {
        totalTopicCount += topic.subtopics.length;
      }
    }

    // Calculate estimated records
    let estimatedRecords = 0;
    for (const topic of llmResult.proposed_topics) {
      estimatedRecords += topic.target_count;
      if (topic.subtopics) {
        for (const sub of topic.subtopics) {
          estimatedRecords += sub.target_count;
        }
      }
    }

    // Build the complete plan
    const plan: SetupPlan = {
      dataset_id,
      dataset_name: dataset.name,
      objective,
      knowledge_sources: knowledgeSourcesSummary,
      proposed_topics: llmResult.proposed_topics,
      total_topic_count: totalTopicCount,
      data_generation: {
        seed_count: Math.min(seed_count, estimatedRecords),
        strategy: llmResult.strategy_notes,
        grounded_in_knowledge: readySources.length > 0,
      },
      grader_config: {
        criteria: llmResult.grader_criteria,
        passing_threshold: 0.7,
        template_preview: generateGraderTemplate(llmResult.grader_criteria, objective),
      },
      execution_steps: [
        {
          step: 'Apply Topic Hierarchy',
          description: `Configure ${totalTopicCount} topics for organizing training data`,
          estimated_time: '~5 seconds',
        },
        {
          step: 'Generate Initial Data',
          description: `Generate ${estimatedRecords} training examples distributed across topics`,
          estimated_time: estimatedRecords > 100 ? '~3-5 minutes' : '~1-2 minutes',
        },
        {
          step: 'Configure Evaluator',
          description: 'Set up the grading criteria for evaluating model responses',
          estimated_time: '~5 seconds',
        },
        {
          step: 'Run Dry Run',
          description: 'Test the training data with the current model to establish baseline',
          estimated_time: '~1-2 minutes',
        },
        {
          step: 'Setup Fine-tune Job',
          description: 'Prepare the fine-tuning job (you can start it when ready)',
          estimated_time: '~10 seconds',
        },
      ],
      estimated_records: estimatedRecords,
      estimated_duration: '3-5 minutes',
    };

    console.log('[proposeSetupPlan] Plan generated successfully');

    // Emit event so the right panel can display the plan card
    emitter.emit('vllora_setup_plan_proposed', { datasetId: dataset_id, plan });

    return {
      success: true,
      plan,
    };
  } catch (error) {
    console.error('[proposeSetupPlan] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate setup plan',
    };
  }
};

// =============================================================================
// Tool Definition
// =============================================================================

export const proposeSetupPlanTool: DistriFnTool = {
  name: 'propose_setup_plan',
  description: `Generate a comprehensive setup plan for first-time users.

This tool analyzes the dataset objective and uploaded knowledge sources to propose:
- Topic hierarchy for organizing training data
- Data generation strategy with target counts per topic
- Evaluation grader configuration with domain-specific criteria
- Step-by-step execution plan

Use this tool when:
- Dataset is empty (no records yet)
- User has uploaded knowledge sources
- User wants a guided setup experience

The plan is presented to the user for approval before execution.
After approval, use execute_setup_plan to run all steps automatically.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID to generate a setup plan for',
      },
      seed_count: {
        type: 'number',
        default: 30,
        description: 'Target number of initial seed examples (default: 30)',
      },
    },
    required: ['dataset_id'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await proposeSetupPlanHandler(input as Record<string, unknown>)),
} as DistriFnTool;
