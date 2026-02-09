/**
 * Propose Setup Plan Tool Definition
 */

import type { DistriFnTool } from '@distri/core';
import { proposeSetupPlanHandler } from './handler';

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
