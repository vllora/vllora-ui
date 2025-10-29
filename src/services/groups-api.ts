import { Pagination, Span } from '@/types/common-type';
import { apiClient, handleApiResponse } from '@/lib/api-client';

// Re-export types for convenience
export type { Pagination, Span };

export interface GroupDTO {
  time_bucket: number; // Start timestamp of the bucket in microseconds
  thread_ids: string[]; // All thread IDs in this bucket
  trace_ids: string[]; // All trace IDs in this bucket
  run_ids: string[]; // All run IDs in this bucket
  root_span_ids: string[]; // All root span IDs in this bucket
  request_models: string[]; // Models requested (from api_invoke)
  used_models: string[]; // Models actually used (from model_call)
  llm_calls: number; // Number of LLM calls in this bucket
  cost: number; // Total cost
  input_tokens: number | null; // Total input tokens
  output_tokens: number | null; // Total output tokens
  start_time_us: number; // First span's start time in the bucket
  finish_time_us: number; // Last span's finish time in the bucket
  errors: string[]; // All errors in this bucket
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

export const fetchSpansByBucketGroup = async (props: {
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

/**
 * Fetch metadata for a single bucket by filtering to its time range
 */
export const fetchSingleBucket = async (props: {
  timeBucket: number;
  projectId: string;
  bucketSize: number; // In seconds
}): Promise<GroupDTO | null> => {
  const { timeBucket, projectId, bucketSize } = props;

  // Calculate the time range for this bucket
  const bucket_size_us = bucketSize * 1_000_000;
  const start_time_min = timeBucket;
  const start_time_max = timeBucket + bucket_size_us - 1;

  const result = await listGroups({
    projectId,
    params: {
      bucketSize,
      start_time_min,
      start_time_max,
      limit: 1,
      offset: 0,
    },
  });

  return result.data.length > 0 ? result.data[0] : null;
};
