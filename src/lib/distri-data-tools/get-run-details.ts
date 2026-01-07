/**
 * Get Run Details Tool Handler
 */

import { getRunDetails as getRunDetailsApi } from '@/services/runs-api';
import { getCurrentProjectId } from './helpers';

/**
 * Get detailed information about a specific run
 * Reuses: @/services/runs-api.ts -> getRunDetails
 *
 * @param runId - Required: The run ID to fetch details for
 * @param projectId - Project ID (defaults to current)
 */
export async function getRunDetails(params: Record<string, unknown>) {
  try {
    const runId = params.runId as string;
    if (!runId) {
      return { success: false, error: 'runId is required' };
    }

    const projectId = (params.projectId as string) || await getCurrentProjectId();
    const result = await getRunDetailsApi({ runId, projectId });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch run details',
    };
  }
}
