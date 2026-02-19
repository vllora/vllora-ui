/**
 * Propose Setup Plan Tool Definition
 */

import type { DistriFnTool } from '@distri/core';
import { proposeSetupPlanHandler } from './handler';

export const proposeSetupPlanTool: DistriFnTool = {
  name: 'propose_setup_plan',
  description: `Propose a plan for user approval before executing a complex operation.

This tool validates, persists, and displays the plan in the UI for user review.
It does NOT generate the plan — you (the agent) construct the plan yourself.

Workflow:
1. Assess dataset state (use get_dataset_state)
2. If needed, analyze knowledge sources (use analyze_knowledge_sources)
3. Construct a plan with execution_steps, steps_to_execute, and any overrides
4. Call this tool to show the plan to the user
5. After user approves, call execute_setup_plan

Use this for any complex multi-step operation: initial setup, data augmentation,
regrading, retraining, bulk topic changes, etc.`,
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
          execution_steps: {
            type: 'array',
            description: 'Human-readable steps shown in the UI',
            items: {
              type: 'object',
              properties: {
                step: { type: 'string' },
                description: { type: 'string' },
                estimated_time: { type: 'string' },
              },
              required: ['step', 'description', 'estimated_time'],
            },
          },
          steps_to_execute: {
            type: 'array',
            description: 'Step IDs to run: topics, adjust_topics, categorize, generate, grader, upload, dryrun, readme, finetune',
            items: { type: 'string' },
          },
          estimated_records: { type: 'number' },
          estimated_duration: { type: 'string' },
        },
        required: ['dataset_name', 'objective', 'proposed_topics', 'grader_config', 'execution_steps', 'steps_to_execute', 'estimated_records', 'estimated_duration'],
      },
    },
    required: ['dataset_id', 'plan'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await proposeSetupPlanHandler(input as Record<string, unknown>)),
} as DistriFnTool;
