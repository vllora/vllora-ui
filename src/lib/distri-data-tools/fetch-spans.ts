/**
 * Fetch Spans Tool Handler
 */

import { listSpans, type ListSpansQuery } from '@/services/spans-api';
import { getCurrentProjectId, toCommaSeparated } from './helpers';

/**
 * Fetch spans with filtering
 * Reuses: @/services/spans-api.ts -> listSpans
 *
 * @param spanIds - Filter by span IDs (string or array) - use to fetch specific spans by ID
 * @param threadIds - Filter by thread IDs (string or array)
 * @param runIds - Filter by run IDs (string or array)
 * @param operationNames - Filter by operation types (string or array)
 * @param parentSpanIds - Filter by parent span IDs (string or array)
 * @param labels - Filter by labels (string or array) - filters by attribute.label
 * @param limit - Max results (default: 10, to prevent context overflow)
 * @param offset - Pagination offset
 * @param projectId - Project ID (defaults to current)
 */
export async function fetchSpans(params: Record<string, unknown>) {
  try {
    const projectId = (params.projectId as string) || await getCurrentProjectId();

    const query: ListSpansQuery = {};

    // spans-api uses camelCase, just pass through with conversion
    if (params.spanIds) query.spanIds = toCommaSeparated(params.spanIds as string | string[]);
    if (params.threadIds) query.threadIds = toCommaSeparated(params.threadIds as string | string[]);
    if (params.runIds) query.runIds = toCommaSeparated(params.runIds as string | string[]);
    if (params.operationNames) query.operationNames = toCommaSeparated(params.operationNames as string | string[]);
    if (params.parentSpanIds) query.parentSpanIds = toCommaSeparated(params.parentSpanIds as string | string[]);
    if (params.labels) query.labels = toCommaSeparated(params.labels as string | string[]);
    // Default limit to 10 to prevent context overflow (spans can contain large payloads ~9KB each)
    query.limit = (params.limit as number) || 10;
    if (params.offset) query.offset = params.offset as number;

    const result = await listSpans({ projectId, params: query });

    return {
      success: true,
      data: result.data,
      pagination: result.pagination,
      _note: result.pagination && result.pagination.total > query.limit
        ? `Showing ${query.limit} of ${result.pagination.total} spans. Use limit/offset for more.`
        : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch spans',
    };
  }
}
