/**
 * List Labels Tool Handler
 */

import { listLabels as listLabelsApi } from '@/services/labels-api';
import { getCurrentProjectId } from './helpers';

/**
 * List available labels with counts
 * Reuses: @/services/labels-api.ts -> listLabels
 *
 * @param threadId - Filter to labels within a specific thread (optional)
 * @param limit - Maximum number of labels to return (default: 100)
 * @param projectId - Project ID (defaults to current)
 */
export async function listLabels(params: Record<string, unknown>) {
  try {
    const projectId = (params.projectId as string) || await getCurrentProjectId();

    const result = await listLabelsApi({
      projectId,
      params: {
        threadId: params.threadId as string | undefined,
        limit: (params.limit as number) || 100,
      },
    });

    return {
      success: true,
      data: result.labels,
      total: result.labels.length,
      _note: params.threadId
        ? `Labels found in thread ${params.threadId}`
        : 'Labels found across entire project',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list labels',
    };
  }
}
