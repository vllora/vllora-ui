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
      },
    },
    required: ['dataset_id', 'plan'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await proposeSetupPlanHandler(input as Record<string, unknown>)),
} as DistriFnTool;
