/**
 * Fetch Groups Tool Handler
 */

import { listGroups, type ListGroupsQuery } from '@/services/groups-api';
import { getCurrentProjectId, toCommaSeparated } from './helpers';

/**
 * Fetch aggregated groups
 * Reuses: @/services/groups-api.ts -> listGroups
 *
 * @param groupBy - 'time' | 'thread' | 'run' (default: 'time')
 * @param threadIds - Filter by thread IDs (string or array)
 * @param modelName - Filter by model name
 * @param bucketSize - Time bucket size in seconds (for groupBy='time')
 * @param limit - Max results
 * @param offset - Pagination offset
 * @param projectId - Project ID (defaults to current)
 */
export async function fetchGroups(params: Record<string, unknown>) {
  try {
    const projectId = (params.projectId as string) || await getCurrentProjectId();

    const query: ListGroupsQuery = {};

    // Convert agent params (camelCase) to API params (snake_case for groups-api)
    if (params.groupBy) query.group_by = params.groupBy as 'time' | 'thread' | 'run';
    if (params.threadIds) query.thread_ids = toCommaSeparated(params.threadIds as string | string[]);
    if (params.modelName) query.model_name = params.modelName as string;
    if (params.bucketSize) query.bucket_size = params.bucketSize as number;
    if (params.limit) query.limit = params.limit as number;
    if (params.offset) query.offset = params.offset as number;

    const result = await listGroups({ projectId, params: query });

    return {
      success: true,
      data: result.data,
      pagination: result.pagination,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch groups',
    };
  }
}
