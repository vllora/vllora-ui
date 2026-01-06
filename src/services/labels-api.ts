import { apiClient, handleApiResponse } from '@/lib/api-client';

/**
 * Label information with count
 */
export interface LabelInfo {
  name: string;
  count: number;
}

/**
 * Response from the labels endpoint
 */
export interface ListLabelsResponse {
  labels: LabelInfo[];
}

/**
 * Query parameters for listing labels
 */
export interface ListLabelsQuery {
  threadId?: string;
  limit?: number;
}

/**
 * List available labels with optional filtering
 *
 * @example
 * // Get all labels for a project
 * const labels = await listLabels({ projectId: 'proj-123' });
 *
 * @example
 * // Get labels for a specific thread
 * const threadLabels = await listLabels({
 *   projectId: 'proj-123',
 *   params: { threadId: 'thread-abc' }
 * });
 */
export const listLabels = async (props: {
  projectId: string;
  params?: ListLabelsQuery;
}): Promise<ListLabelsResponse> => {
  const { projectId, params } = props;

  // Build query string
  const queryParams = new URLSearchParams();
  if (params?.threadId) {
    queryParams.append('threadId', params.threadId);
  }
  if (params?.limit) {
    queryParams.append('limit', String(params.limit));
  }

  const queryString = queryParams.toString();
  const endpoint = `/labels${queryString ? `?${queryString}` : ''}`;

  const response = await apiClient(endpoint, {
    method: 'GET',
    headers: {
      'x-project-id': projectId,
    },
  });

  return handleApiResponse<ListLabelsResponse>(response);
};

/**
 * Get labels for a specific thread
 */
export const getThreadLabels = async (props: {
  projectId: string;
  threadId: string;
  limit?: number;
}): Promise<ListLabelsResponse> => {
  return listLabels({
    projectId: props.projectId,
    params: {
      threadId: props.threadId,
      limit: props.limit,
    },
  });
};

/**
 * Get all labels for a project (no thread filter)
 */
export const getProjectLabels = async (props: {
  projectId: string;
  limit?: number;
}): Promise<ListLabelsResponse> => {
  return listLabels({
    projectId: props.projectId,
    params: {
      limit: props.limit,
    },
  });
};
