import { Pagination, Span } from '@/types/common-type';
import { apiClient, handleApiResponse } from '@/lib/api-client';

// Re-export types for convenience
export type { Pagination, Span };

export interface GroupDTO {
  time_bucket: number; // Start timestamp of the bucket in microseconds
  count: number; // Number of spans in this bucket
  start_time_us: number; // First span's start time in the bucket
  finish_time_us: number; // Last span's finish time in the bucket
  used_models: string[];
  cost: number;
  input_tokens: number;
  output_tokens: number;
  errors: string[];
}

export interface PaginatedGroupsResponse {
  data: GroupDTO[];
  pagination: Pagination;
}

export interface ListGroupsQuery {
  // Filters
  threadIds?: string; // Comma-separated
  traceIds?: string; // Comma-separated
  modelName?: string;
  typeFilter?: 'model' | 'mcp';

  // Time range
  start_time_min?: number; // In microseconds
  start_time_max?: number; // In microseconds

  // Bucketing
  bucketSize?: number; // Time bucket size in seconds (e.g., 3600 for 1 hour)

  // Pagination
  offset?: number;
  limit?: number;
}

export const listGroups = async (props: {
  projectId: string;
  params?: ListGroupsQuery;
}): Promise<PaginatedGroupsResponse> => {
  const { projectId, params } = props;

  // Create a clean copy of params to avoid mutation issues
  let sendParams = { ...params };

  // Remove empty parameters
  if (!params?.threadIds) {
    delete sendParams.threadIds;
  }
  if (!params?.traceIds) {
    delete sendParams.traceIds;
  }

  // Build query string
  const queryParams = new URLSearchParams();
  Object.entries(sendParams || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.append(key, String(value));
    }
  });

  const endpoint = `/group?${queryParams.toString()}`;

  const response = await apiClient(endpoint, {
    method: 'GET',
    headers: {
      'x-project-id': projectId,
    },
  });

  return handleApiResponse<PaginatedGroupsResponse>(response);
};

export const fetchGroupSpans = async (props: {
  timeBucket: number;
  projectId: string;
  bucketSize?: number; // In seconds
  offset?: number;
  limit?: number;
}): Promise<{ data: Span[]; pagination: Pagination }> => {
  const { timeBucket, projectId, bucketSize = 3600, offset = 0, limit = 100 } = props;

  // Build query string
  const queryParams = new URLSearchParams({
    bucketSize: String(bucketSize),
    offset: String(offset),
    limit: String(limit),
  });

  const endpoint = `/group/${timeBucket}?${queryParams.toString()}`;

  const response = await apiClient(endpoint, {
    method: 'GET',
    headers: {
      'x-project-id': projectId,
    },
  });

  return handleApiResponse<{ data: Span[]; pagination: Pagination }>(response);
};
