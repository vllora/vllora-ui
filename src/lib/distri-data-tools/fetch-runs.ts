/**
 * Fetch Runs Tool Handler
 */

import { listRuns, type ListRunsQuery } from '@/services/runs-api';
import { getCurrentProjectId, toCommaSeparated } from './helpers';

/**
 * Fetch runs with filtering
 * Reuses: @/services/runs-api.ts -> listRuns
 *
 * @param threadIds - Filter by thread IDs (string or array)
 * @param runIds - Filter by run IDs (string or array)
 * @param modelName - Filter by model name
 * @param limit - Max results (default: 50)
 * @param offset - Pagination offset
 * @param period - Time filter: 'last_hour', 'last_day', 'last_week', etc.
 * @param projectId - Project ID (defaults to current)
 */
export async function fetchRuns(params: Record<string, unknown>) {
  try {
    const projectId = (params.projectId as string) || await getCurrentProjectId();

    const query: ListRunsQuery = {};

    // Convert agent params (camelCase) to API params (snake_case for runs-api)
    if (params.threadIds) query.thread_ids = toCommaSeparated(params.threadIds as string | string[]);
    if (params.runIds) query.run_ids = toCommaSeparated(params.runIds as string | string[]);
    if (params.modelName) query.model_name = params.modelName as string;
    if (params.limit) query.limit = params.limit as number;
    if (params.offset) query.offset = params.offset as number;
    if (params.period) query.period = params.period as ListRunsQuery['period'];

    const result = await listRuns({ projectId, params: query });

    return {
      success: true,
      data: result.data,
      pagination: result.pagination,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch runs',
    };
  }
}
