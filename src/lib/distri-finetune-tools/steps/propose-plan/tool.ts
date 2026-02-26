/**
 * Propose plan Tool Definition
 */

import type { DistriFnTool } from '@distri/core';
import { proposePlanHandler } from './handler';

export const proposePlanTool: DistriFnTool = {
  name: 'propose_plan',
  description: `Propose a plan for user approval before executing a complex operation.

This tool validates, persists, and displays the plan in the UI for user review.
It does NOT generate the plan — you (the agent) construct the plan yourself.

IMPORTANT: You MUST provide plan_markdown with the full plan content as markdown.
The frontend renders this markdown directly. Include a checklist with - [ ] for
each step you plan to execute. After approval, call tools directly and use
update_plan_markdown to check off completed steps.

Workflow:
1. Assess dataset state (use get_dataset_state)
2. If needed, analyze knowledge sources (use analyze_knowledge_sources)
3. Construct a plan with plan_markdown containing the full plan + checklist
4. Call this tool to show the plan to the user
5. After user approves, call tools directly (apply_topic_hierarchy, generate_initial_data, etc.)
6. After each tool, call update_plan_markdown to check off the step`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID',
      },
      plan: {
        type: 'object',
        description: 'The plan to propose. You construct this based on dataset state and user intent.',
        properties: {
          dataset_name: { type: 'string', description: 'Dataset display name' },
          objective: { type: 'string', description: 'Training objective' },
          title: { type: 'string', description: 'Plan title' },
          description: { type: 'string', description: 'Plan description' },
          plan_markdown: {
            type: 'string',
            description: 'REQUIRED. Full plan content as markdown. Include a checklist with - [ ] for each execution step. The frontend renders this directly.',
          },
          proposed_topics: {
            type: 'array',
            description: 'Topic hierarchy. Each topic: { name, description, target_count, subtopics? }. Parent target_count=0, leaf target_count=30.',
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
                  },
                },
              },
              required: ['name', 'description', 'target_count'],
            },
          },
          grader_config: {
            type: 'object',
            description: 'Grader config with evaluation criteria. Do NOT include template_preview — the JS evaluator is generated fresh at execution time.',
            properties: {
              criteria: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                  },
                  required: ['name', 'description'],
                },
              },
            },
            required: ['criteria'],
          },
          data_generation: {
            type: 'object',
            properties: {
              strategy: { type: 'string' },
              grounded_in_knowledge: { type: 'boolean' },
            },
            required: ['strategy', 'grounded_in_knowledge'],
          },
          output_format: {
            description: 'Structured output schema, or null for free-form responses',
          },
          knowledge_sources: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                section_headings: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          estimated_records: { type: 'number' },
        },
        required: ['dataset_name', 'objective', 'plan_markdown'],
      },
    },
    required: ['dataset_id', 'plan'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await proposePlanHandler(input as Record<string, unknown>)),
} as DistriFnTool;
