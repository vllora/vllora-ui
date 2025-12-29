import { Pagination, Span } from '@/types/common-type';
import { apiClient, handleApiResponse } from '@/lib/api-client';

// Re-export types for convenience
export type { Pagination, Span };

/**
 * Query parameters for listing spans
 *
 * All ID filters support:
 * - Comma-separated values for multiple IDs (e.g., "id1,id2,id3")
 * - Special value "null" for IS NULL filtering (e.g., threadIds=null → no thread)
 * - Special value "!null" for IS NOT NULL filtering (e.g., threadIds=!null → has thread)
 */
export interface ListSpansQuery {
  // ID filters - comma-separated or special values "null"/"!null"
  threadIds?: string;      // Filter by thread IDs or null/"!null"
  runIds?: string;         // Filter by run IDs or null/"!null"
  operationNames?: string; // Filter by operation names or null/"!null"
  parentSpanIds?: string;  // Filter by parent span IDs or null/"!null"

  // Label filter - comma-separated labels (e.g., "flight_search,budget_agent")
  labels?: string;         // Filter by labels from attribute.label

  // Time range filters
  startTime?: number;      // Filter spans that started after this timestamp (microseconds)
  endTime?: number;        // Filter spans that started before this timestamp (microseconds)

  // Pagination
  offset?: number;         // Number of results to skip (default: 0)
  limit?: number;          // Number of results to return (default: 100)
}

/**
 * Response format for paginated spans
 */
export interface PaginatedSpansResponse {
  data: Span[];
  pagination: Pagination;
}

/**
 * List spans with optional filters and pagination
 *
 * @example
 * // Get all spans
 * const allSpans = await listSpans({ projectId: 'proj-123' });
 *
 * @example
 * // Get spans for specific threads
 * const threadSpans = await listSpans({
 *   projectId: 'proj-123',
 *   params: { threadIds: 'thread-1,thread-2' }
 * });
 *
 * @example
 * // Get spans with a thread_id (not null)
 * const spansWithThread = await listSpans({
 *   projectId: 'proj-123',
 *   params: { threadIds: '!null' }
 * });
 *
 * @example
 * // Get root spans (no parent)
 * const rootSpans = await listSpans({
 *   projectId: 'proj-123',
 *   params: { parentSpanIds: 'null' }
 * });
 *
 * @example
 * // Get model_call operations with pagination
 * const modelCalls = await listSpans({
 *   projectId: 'proj-123',
 *   params: {
 *     operationNames: 'model_call',
 *     limit: 50,
 *     offset: 0
 *   }
 * });
 *
 * @example
 * // Complex filter: root conversation spans
 * const rootConversationSpans = await listSpans({
 *   projectId: 'proj-123',
 *   params: {
 *     threadIds: '!null',
 *     parentSpanIds: 'null'
 *   }
 * });
 */
export const listSpans = async (props: {
  projectId: string;
  params?: ListSpansQuery;
}): Promise<PaginatedSpansResponse> => {
  const { projectId, params } = props;

  // Create a clean copy of params
  const sendParams = { ...params };

  // Build query string
  const queryParams = new URLSearchParams();
  Object.entries(sendParams || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.append(key, String(value));
    }
  });

  const endpoint = `/spans?${queryParams.toString()}`;

  const response = await apiClient(endpoint, {
    method: 'GET',
    headers: {
      'x-project-id': projectId,
    },
  });

  return handleApiResponse<PaginatedSpansResponse>(response);
};

/**
 * Helper functions for common span queries
 */

/**
 * Get all spans for a specific thread
 */
export const getThreadSpans = async (props: {
  projectId: string;
  threadId: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedSpansResponse> => {
  return listSpans({
    projectId: props.projectId,
    params: {
      threadIds: props.threadId,
      limit: props.limit,
      offset: props.offset,
    },
  });
};

/**
 * Get all spans for a specific run
 */
export const getRunSpans = async (props: {
  projectId: string;
  runId: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedSpansResponse> => {
  return listSpans({
    projectId: props.projectId,
    params: {
      runIds: props.runId,
      limit: props.limit,
      offset: props.offset,
    },
  });
};

/**
 * Get root spans (spans without a parent)
 */
export const getRootSpans = async (props: {
  projectId: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedSpansResponse> => {
  return listSpans({
    projectId: props.projectId,
    params: {
      parentSpanIds: 'null',
      limit: props.limit,
      offset: props.offset,
    },
  });
};

/**
 * Get child spans of a specific parent
 */
export const getChildSpans = async (props: {
  projectId: string;
  parentSpanId: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedSpansResponse> => {
  return listSpans({
    projectId: props.projectId,
    params: {
      parentSpanIds: props.parentSpanId,
      limit: props.limit,
      offset: props.offset,
    },
  });
};

/**
 * Get spans by operation type(s)
 */
export const getSpansByOperation = async (props: {
  projectId: string;
  operationNames: string | string[]; // Single operation or array
  limit?: number;
  offset?: number;
}): Promise<PaginatedSpansResponse> => {
  const operations = Array.isArray(props.operationNames)
    ? props.operationNames.join(',')
    : props.operationNames;

  return listSpans({
    projectId: props.projectId,
    params: {
      operationNames: operations,
      limit: props.limit,
      offset: props.offset,
    },
  });
};

/**
 * Get a single span by ID
 */
export const getSpanById = async (props: {
  spanId: string;
}): Promise<Span | null> => {
  const response = await apiClient(`/spans?span_id=${props.spanId}`, {
    method: 'GET',
  });

  const data = await handleApiResponse<PaginatedSpansResponse>(response);
  return data.data.length > 0 ? data.data[0] : null;
};

/**
 * Get spans within a time range
 */
export const getSpansInTimeRange = async (props: {
  projectId: string;
  startTime: number; // microseconds
  endTime: number;   // microseconds
  limit?: number;
  offset?: number;
}): Promise<PaginatedSpansResponse> => {
  return listSpans({
    projectId: props.projectId,
    params: {
      startTime: props.startTime,
      endTime: props.endTime,
      limit: props.limit,
      offset: props.offset,
    },
  });
};

/**
 * Get spans that have a thread_id (conversation spans)
 */
export const getConversationSpans = async (props: {
  projectId: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedSpansResponse> => {
  return listSpans({
    projectId: props.projectId,
    params: {
      threadIds: '!null',
      limit: props.limit,
      offset: props.offset,
    },
  });
};

/**
 * Get root conversation spans (top-level spans in conversations)
 */
export const getRootConversationSpans = async (props: {
  projectId: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedSpansResponse> => {
  return listSpans({
    projectId: props.projectId,
    params: {
      threadIds: '!null',
      parentSpanIds: 'null',
      limit: props.limit,
      offset: props.offset,
    },
  });
};
