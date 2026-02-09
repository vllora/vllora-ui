/**
 * LLM service for generating setup plans
 */

import { DistriClient, type DistriMessage } from '@distri/core';
import { getDistriUrl } from '@/config/api';
import { fetchLucyConfig, type LucyConfig } from '@/lib/agent-sync';
import type { ProposedTopic, GraderCriterion } from './types';
import {
  PLAN_GENERATION_SYSTEM,
  PLAN_GENERATION_USER,
  PLAN_RESPONSE_SCHEMA,
} from './prompts';

// Cache for Lucy config
let cachedLucyConfig: LucyConfig | null = null;

export async function fetchLucyConfigCached(): Promise<LucyConfig> {
  if (cachedLucyConfig) return cachedLucyConfig;
  cachedLucyConfig = await fetchLucyConfig();
  return cachedLucyConfig;
}

export interface LLMPlanResult {
  proposed_topics: ProposedTopic[];
  grader_criteria: GraderCriterion[];
  strategy_notes: string;
}

export async function callLLMForPlan(
  objective: string,
  seedCount: number,
  knowledgeContext?: string
): Promise<LLMPlanResult> {
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
