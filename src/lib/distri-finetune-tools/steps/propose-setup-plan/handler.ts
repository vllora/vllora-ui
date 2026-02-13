/**
 * Propose Setup Plan Handler
 *
 * Validates, persists, and emits a plan for user approval.
 * This tool is intentionally "dumb" — Lucy constructs the plan,
 * this handler just shows it to the user.
 */

import * as datasetsDB from '@/services/datasets-db';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../../types';
import type {
  ProposeSetupPlanParams,
  SetupPlan,
  ProposeSetupPlanResult,
} from './types';
import { saveProposedPlan } from '../proposed-plan-store';

export const proposeSetupPlanHandler: ToolHandler = async (
  params
): Promise<ProposeSetupPlanResult> => {
  try {
    console.log('[proposeSetupPlan] Starting with params:', JSON.stringify(params, null, 2));

    const { dataset_id, plan: agentPlan } = params as unknown as ProposeSetupPlanParams;

    if (!dataset_id) {
      return { success: false, error: 'dataset_id is required' };
    }

    if (!agentPlan) {
      return {
        success: false,
        error: 'plan is required. Use analyze_knowledge_sources first to get recommendations, then construct a plan and pass it here.',
      };
    }

    // Show loading state in UI
    emitter.emit('vllora_setup_plan_generating', { datasetId: dataset_id });

    // Validate dataset exists
    const dataset = await datasetsDB.getDatasetById(dataset_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${dataset_id} not found` };
    }

    // Fill in defaults from dataset
    const plan: SetupPlan = {
      ...agentPlan,
      dataset_id,
      dataset_name: agentPlan.dataset_name || dataset.name,
      objective: agentPlan.objective || dataset.datasetObjective || '',
    };

    // Persist to IndexedDB so it survives page refresh
    await saveProposedPlan(dataset_id, plan);

    // Emit event so the UI can display the plan card
    emitter.emit('vllora_setup_plan_proposed', { datasetId: dataset_id, plan });

    console.log('[proposeSetupPlan] Plan persisted and emitted');
    return { success: true, plan };
  } catch (error) {
    console.error('[proposeSetupPlan] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to propose setup plan',
    };
  }
};
