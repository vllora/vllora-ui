/**
 * Generate Grader Tool
 *
 * Generates an evaluation function (JavaScript grader script) based on:
 * - Dataset training objective
 * - Knowledge sources (if uploaded) — extracted topics, sections, summaries
 * - Topic hierarchy (optional context)
 *
 * Mirrors generate_topics: dedicated LLM pipeline ensures the grader is
 * consistent whether called during plan creation or standalone.
 *
 * Two modes:
 * - Suggest mode (dataset_id only): returns criteria + script without saving
 * - Normal mode (workflow_id): saves to DB
 */

import type { DistriFnTool } from '@distri/core';
import { DistriClient, type DistriMessage } from '@distri/core';
import { getDistriUrl } from '@/config/api';
import { fetchLucyConfig, type LucyConfig } from '@/lib/agent-sync';
import { datasetService, workflowService } from '@/services/service-registry';
import { buildKnowledgeContext } from './shared/knowledge-context';
import { generateGraderTemplate } from './propose-plan/grader-template';
import type { GraderCriterion } from './propose-plan/types';
import { getProposedPlan } from './proposed-plan-store';
import type { ToolHandler } from '../types';

// =============================================================================
// Lucy config cache (same pattern as generate-topics/frontend.ts)
// =============================================================================

let cachedLucyConfig: LucyConfig | null = null;
const fetchLucyConfigCached = async (): Promise<LucyConfig> => {
  if (cachedLucyConfig) return cachedLucyConfig;
  cachedLucyConfig = await fetchLucyConfig();
  return cachedLucyConfig;
};

// =============================================================================
// LLM-based criteria generation
// =============================================================================

interface CriteriaResponse {
  criteria: Array<{ name: string; description: string }>;
}

const CRITERIA_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'grader_criteria',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        criteria: {
          type: 'array',
          description: 'Evaluation criteria for grading model responses',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Short criterion name (2-4 words)' },
              description: { type: 'string', description: 'What the evaluator checks for this criterion' },
            },
            required: ['name', 'description'],
            additionalProperties: false,
          },
        },
      },
      required: ['criteria'],
      additionalProperties: false,
    },
  },
};

function buildSystemPrompt(hasKnowledgeSources: boolean): string {
  let prompt = `You are an expert at designing evaluation criteria for LLM fine-tuning.
Your job is to create specific, measurable grading criteria for evaluating model responses.

Rules:
- Each criterion must be specific to the training domain, not generic
- Criterion names should be short (2-4 words), descriptive, and unique
- Descriptions should explain exactly what the evaluator checks and what scores high vs low
- Generate 2-5 criteria (aim for 3 unless the domain requires more)
- Criteria must be independently measurable (no overlapping evaluation)
- Output MUST be valid JSON matching the schema`;

  if (hasKnowledgeSources) {
    prompt += `

IMPORTANT: When knowledge sources are provided, your criteria MUST reflect the specific requirements and quality standards from those documents. For example:
- If the document describes a specific format → add a criterion for format compliance
- If the document has domain-specific rules → add criteria that evaluate domain accuracy
- If the document shows examples → criteria should evaluate consistency with those examples`;
  }

  return prompt;
}

function buildUserPrompt(options: {
  objective: string;
  knowledgeContext?: string;
  topicNames?: string[];
}): string {
  const { objective, knowledgeContext, topicNames } = options;

  let prompt = `## Training Objective
${objective}`;

  if (knowledgeContext) {
    prompt += `

## Knowledge Sources (use these to inform your criteria)

${knowledgeContext}`;
  }

  if (topicNames && topicNames.length > 0) {
    prompt += `

## Topic Areas (for context on what the model covers)
${topicNames.map((t) => `- ${t}`).join('\n')}`;
  }

  prompt += `

Generate evaluation criteria for grading model responses. The criteria should enable an LLM-as-judge to reliably score responses on a 0-5 scale for each criterion.`;

  return prompt;
}

async function generateCriteriaViaLLM(
  objective: string,
  knowledgeContext?: string,
  topicNames?: string[],
): Promise<CriteriaResponse> {
  const lucyConfig = await fetchLucyConfigCached();
  const rawUrl = lucyConfig.distri_url || getDistriUrl();
  const baseUrl = `${rawUrl.replace(/\/$/, '')}/v1`;
  const distriClient = DistriClient.create({ baseUrl });

  const modelSettingsFromConfig = lucyConfig.model_settings || {};
  const hasKnowledgeSources = !!knowledgeContext;

  const systemPrompt = buildSystemPrompt(hasKnowledgeSources);
  const userPrompt = buildUserPrompt({ objective, knowledgeContext, topicNames });

  const messages: DistriMessage[] = [
    DistriClient.initDistriMessage('system', [{ part_type: 'text', data: systemPrompt }]),
    DistriClient.initDistriMessage('user', [{ part_type: 'text', data: userPrompt }]),
  ];

  const response = await distriClient.llm(messages, [], {
    model_settings: {
      ...modelSettingsFromConfig,
      model: modelSettingsFromConfig.model || 'openai/gpt-4.1',
      temperature: modelSettingsFromConfig.temperature ?? 0.2,
      response_format: CRITERIA_SCHEMA,
    },
  });

  if (!response.content) {
    throw new Error('LLM returned empty response');
  }

  try {
    return JSON.parse(response.content.trim());
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch =
      response.content.match(/```json\s*([\s\S]*?)\s*```/) ||
      response.content.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }
    throw new Error('Failed to parse LLM response as JSON');
  }
}

// =============================================================================
// Core grader generation (no side effects)
// =============================================================================

async function generateGraderCore(
  datasetId: string,
  objective: string,
  topicNames?: string[],
  providedCriteria?: GraderCriterion[],
): Promise<{ success: boolean; criteria?: GraderCriterion[]; script?: string; error?: string }> {
  try {
    let criteria: GraderCriterion[];

    if (providedCriteria && providedCriteria.length > 0) {
      // User provided explicit criteria — skip LLM, use directly
      console.log('[generate_grader] Using provided criteria:', providedCriteria.length);
      criteria = providedCriteria;
    } else {
      // No criteria provided — generate via LLM using knowledge sources
      const knowledgeCtx = await buildKnowledgeContext(datasetId);

      console.log('[generate_grader] Generating criteria via LLM:', {
        hasKnowledgeSources: knowledgeCtx.readyCount > 0,
        topicCount: topicNames?.length ?? 0,
      });

      const result = await generateCriteriaViaLLM(
        objective,
        knowledgeCtx.contextString || undefined,
        topicNames,
      );

      if (!result.criteria || result.criteria.length === 0) {
        return { success: false, error: 'LLM returned no criteria' };
      }
      criteria = result.criteria;
    }

    // Generate the full JS evaluation function from criteria
    const script = generateGraderTemplate(criteria, objective, null);

    return {
      success: true,
      criteria,
      script,
    };
  } catch (error) {
    console.error('[generate_grader] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate grader',
    };
  }
}

// =============================================================================
// Handler
// =============================================================================

export const generateGraderHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, dataset_id, topics, criteria: rawCriteria, mode = 'replace' } = params;
    const topicNames = Array.isArray(topics) ? topics.map(String) : undefined;


    // Parse explicit criteria if provided
    let parsedCriteria: GraderCriterion[] | undefined =
      Array.isArray(rawCriteria) && rawCriteria.length > 0
        ? rawCriteria
            .filter((c): c is Record<string, unknown> => c && typeof c === 'object')
            .map((c) => ({
              name: String(c.name || ''),
              description: String(c.description || ''),
            }))
            .filter((c) => c.name.trim().length > 0)
        : undefined;

    // Append mode: merge new criteria with existing from plan
    if (mode === 'append' && parsedCriteria && parsedCriteria.length > 0) {
      const dsId = typeof dataset_id === 'string' ? dataset_id : undefined;
      const wfDsId = workflow_id && typeof workflow_id === 'string'
        ? (await workflowService.get(workflow_id))?.datasetId
        : undefined;
      const resolvedDatasetId = dsId || wfDsId;

      if (resolvedDatasetId) {
        const plan = await getProposedPlan(resolvedDatasetId);
        const existingCriteria = plan?.grader_config?.criteria || [];
        if (existingCriteria.length > 0) {
          // Deduplicate by name (case-insensitive)
          const existingNames = new Set(existingCriteria.map((c) => c.name.toLowerCase()));
          const newOnly = parsedCriteria.filter((c) => !existingNames.has(c.name.toLowerCase()));
          parsedCriteria = [...existingCriteria, ...newOnly];
          console.log('[generate_grader] Append mode: merged', existingCriteria.length, 'existing +', newOnly.length, 'new criteria');
        }
      }
    }

    const providedCriteria = parsedCriteria;

    // =========================================================================
    // Suggest mode: dataset_id only, no side effects
    // Used during plan creation to get grader suggestions
    // =========================================================================
    if (dataset_id && typeof dataset_id === 'string' && !workflow_id) {
      const dataset = await datasetService.getById(dataset_id);
      if (!dataset) {
        return { success: false, error: `Dataset ${dataset_id} not found` };
      }

      const objective = dataset.datasetObjective;
      if (!objective?.trim()) {
        return {
          success: false,
          error: 'Dataset has no training objective. Please set one first.',
        };
      }

      console.log('[generate_grader] Suggest mode for dataset:', dataset_id);

      const result = await generateGraderCore(dataset_id, objective, topicNames, providedCriteria);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        criteria: result.criteria,
        script: result.script,
        suggest_only: true,
      };
    }

    // =========================================================================
    // Normal mode: workflow_id required, saves to DB
    // =========================================================================
    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id or dataset_id is required' };
    }

    const workflow = await workflowService.get(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    const dataset = await datasetService.getById(workflow.datasetId);
    const objective = dataset?.datasetObjective || workflow.trainingGoals || '';
    if (!objective.trim()) {
      return { success: false, error: 'No training objective found' };
    }

    // Switch to Evaluator tab
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('finetune-set-view-mode', {
          detail: { section: 'evaluator' },
        }),
      );
    }

    const result = await generateGraderCore(workflow.datasetId, objective, topicNames, providedCriteria);
    if (!result.success || !result.script) {
      return { success: false, error: result.error };
    }

    // Save eval script to dataset (gateway SQLite via PUT /workflows)
    await datasetService.updateEvalScript(workflow.datasetId, result.script);

    // Update workflow metadata
    await workflowService.updateStepData(workflow_id, 'graderConfig', {
      type: 'js',
      configuredAt: Date.now(),
    });

    return {
      success: true,
      criteria: result.criteria,
      configured_at: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate grader',
    };
  }
};

// =============================================================================
// Tool Definition
// =============================================================================

export const generateGraderTool: DistriFnTool = {
  name: 'generate_grader',
  description:
    'Generate an evaluation function (JavaScript grader script) for RFT. Uses the training objective and uploaded knowledge sources to create domain-specific evaluation criteria and a complete LLM-as-judge script. Can be called in two modes: (1) with dataset_id only for suggest mode (returns criteria + script without saving — use during plan creation), or (2) with workflow_id for normal mode (saves to DB).',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description:
          'The workflow ID. Use for normal mode (saves grader to DB). Either workflow_id or dataset_id is required.',
      },
      dataset_id: {
        type: 'string',
        description:
          'The dataset ID. Use for suggest mode during plan creation — returns criteria + script without saving.',
      },
      topics: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of topic names for context. Helps generate domain-specific criteria.',
      },
      criteria: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Short criterion name (2-4 words)' },
            description: { type: 'string', description: 'What the evaluator checks' },
          },
          required: ['name', 'description'],
        },
        description:
          'Optional explicit criteria. When provided, skips LLM generation and uses these directly to build the evaluation function. Use when the user specifies exact criteria.',
      },
      mode: {
        type: 'string',
        enum: ['replace', 'append'],
        default: 'replace',
        description:
          'How to handle criteria. "replace" (default): criteria replaces everything. "append": criteria are added to existing ones from the current plan (deduplicates by name).',
      },
    },
    required: [],
  },
  handler: async (input) =>
    JSON.stringify(await generateGraderHandler(input as Record<string, unknown>)),
} as DistriFnTool;
