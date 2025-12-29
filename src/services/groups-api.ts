import { Pagination, Span } from '@/types/common-type';
import { apiClient, handleApiResponse } from '@/lib/api-client';

// Re-export types for convenience
export type { Pagination, Span };

// Generic Group DTO with discriminated union for different grouping types
export interface GenericGroupDTO {
  group_by: 'time' | 'thread' | 'run'; // Discriminator field
  group_key: {
    time_bucket?: number; // Present when group_by='time'
    thread_id?: string;   // Present when group_by='thread'
    run_id?: string;      // Present when group_by='run'
  };
  thread_ids: string[]; // All thread IDs in this group
  trace_ids: string[]; // All trace IDs in this group
  run_ids: string[]; // All run IDs in this group
  root_span_ids: string[]; // All root span IDs in this group
  request_models: string[]; // Models requested (from api_invoke)
  used_models: string[]; // Models actually used (from model_call)
  llm_calls: number; // Number of LLM calls in this group
  cost: number; // Total cost
  input_tokens: number | null; // Total input tokens
  output_tokens: number | null; // Total output tokens
  start_time_us: number; // First span's start time in the group
  finish_time_us: number; // Last span's finish time in the group
  errors: string[]; // All errors in this group
}

// Type guards for discriminating between grouping types
export function isTimeGroup(group: GenericGroupDTO): group is GenericGroupDTO & {
  group_by: 'time';
  group_key: { time_bucket: number };
} {
  return group.group_by === 'time' && group.group_key.time_bucket !== undefined;
}

export function isThreadGroup(group: GenericGroupDTO): group is GenericGroupDTO & {
  group_by: 'thread';
  group_key: { thread_id: string };
} {
  return group.group_by === 'thread' && group.group_key.thread_id !== undefined;
}

export function isRunGroup(group: GenericGroupDTO): group is GenericGroupDTO & {
  group_by: 'run';
  group_key: { run_id: string };
} {
  return group.group_by === 'run' && group.group_key.run_id !== undefined;
}

export interface PaginatedGroupsResponse {
  data: GenericGroupDTO[];
  pagination: Pagination;
}

export interface ListGroupsQuery {
  // Grouping
  group_by?: 'time' | 'thread' | 'run'; // Grouping mode (default: 'time')

  // Filters
  thread_ids?: string; // Comma-separated
  trace_ids?: string; // Comma-separated
  model_name?: string;
  type_filter?: 'model' | 'mcp';
  labels?: string; // Comma-separated labels to filter by (attribute.label)

  // Time range
  start_time_min?: number; // In microseconds
  start_time_max?: number; // In microseconds

  // Bucketing (only used when groupBy='time')
  bucket_size?: number; // Time bucket size in seconds (e.g., 3600 for 1 hour)

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
  if (!params?.thread_ids) {
    delete sendParams.thread_ids;
  }
  if (!params?.trace_ids) {
    delete sendParams.trace_ids;
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

/**
 * Unified API to fetch spans for any group type
 */
export const fetchGroupSpans = async (props: {
  projectId: string;
  groupBy: 'time' | 'thread' | 'run';
  timeBucket?: number; // Required for groupBy='time'
  threadId?: string; // Required for groupBy='thread'
  runId?: string; // Required for groupBy='run'
  bucketSize?: number; // Only for groupBy='time', in seconds
  offset?: number;
  limit?: number;
}): Promise<{ data: Span[]; pagination: Pagination }> => {
  const { projectId, groupBy, timeBucket, threadId, runId, bucketSize, offset = 0, limit = 100 } = props;

  // Build query string
  const queryParams = new URLSearchParams({
    group_by: groupBy,
    offset: String(offset),
    limit: String(limit),
  });

  // Add group-specific parameters
  if (groupBy === 'time') {
    if (timeBucket === undefined) {
      throw new Error('timeBucket is required for groupBy=time');
    }
    queryParams.set('time_bucket', String(timeBucket));
    if (bucketSize) {
      queryParams.set('bucket_size', String(bucketSize));
    }
  } else if (groupBy === 'thread') {
    if (!threadId) {
      throw new Error('threadId is required for groupBy=thread');
    }
    queryParams.set('thread_id', threadId);
  } else if (groupBy === 'run') {
    if (!runId) {
      throw new Error('runId is required for groupBy=run');
    }
    queryParams.set('run_id', runId);
  }

  const endpoint = `/group/spans?${queryParams.toString()}`;

  const response = await apiClient(endpoint, {
    method: 'GET',
    headers: {
      'x-project-id': projectId,
    },
  });

  return handleApiResponse<{ data: Span[]; pagination: Pagination }>(response);
};

/**
 * Group identifier for batch requests
 */
export type GroupIdentifier =
  | { groupBy: 'time'; timeBucket: number; bucketSize: number }
  | { groupBy: 'thread'; threadId: string }
  | { groupBy: 'run'; runId: string };

/**
 * Response for batch group spans request
 */
export interface BatchGroupSpansResponse {
  data: {
    [groupKey: string]: {
      spans: Span[];
      pagination: Pagination;
    };
  };
}

/**
 * Fetch spans for multiple groups in a single batched request
 * This reduces HTTP overhead and database connection usage, especially important for SQLite
 */
export const fetchBatchGroupSpans = async (props: {
  projectId: string;
  groups: GroupIdentifier[];
  spansPerGroup?: number;
  labels?: string[]; // Filter spans by labels (attribute.label)
}): Promise<BatchGroupSpansResponse> => {
  const { projectId, groups, spansPerGroup = 100, labels } = props;

  const endpoint = '/group/batch-spans';

  const response = await apiClient(endpoint, {
    method: 'POST',
    headers: {
      'x-project-id': projectId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      groups,
      spansPerGroup,
      // Convert labels array to comma-separated string for backend
      labels: labels && labels.length > 0 ? labels.join(',') : undefined,
    }),
  });

  return handleApiResponse<BatchGroupSpansResponse>(response);
};

/**
 * @deprecated Use fetchGroupSpans with groupBy='time' instead
 */
export const fetchSpansByBucketGroup = async (props: {
  timeBucket: number;
  projectId: string;
  bucketSize?: number;
  offset?: number;
  limit?: number;
}): Promise<{ data: Span[]; pagination: Pagination }> => {
  return fetchGroupSpans({
    ...props,
    groupBy: 'time',
  });
};

/**
 * @deprecated Use fetchGroupSpans with groupBy='thread' instead
 */
export const fetchSpansByThread = async (props: {
  threadId: string;
  projectId: string;
  offset?: number;
  limit?: number;
}): Promise<{ data: Span[]; pagination: Pagination }> => {
  return fetchGroupSpans({
    ...props,
    groupBy: 'thread',
  });
};

/**
 * Fetch metadata for a single group (time/thread/run)
 * This is useful for refreshing stats without fetching spans
 */
export const fetchSingleGroup = async (props: {
  projectId: string;
  groupBy: 'time' | 'thread' | 'run';
  timeBucket?: number; // Required for groupBy='time'
  bucketSize?: number; // Required for groupBy='time', in seconds
  threadId?: string; // Required for groupBy='thread'
  runId?: string; // Required for groupBy='run'
}): Promise<GenericGroupDTO | null> => {
  const { projectId, groupBy, timeBucket, bucketSize, threadId, runId } = props;

  const params: ListGroupsQuery = {
    group_by: groupBy,
    limit: 1,
    offset: 0,
  };

  if (groupBy === 'time') {
    if (timeBucket === undefined || bucketSize === undefined) {
      throw new Error('timeBucket and bucketSize are required for groupBy=time');
    }
    // Calculate the time range for this bucket
    const bucket_size_us = bucketSize * 1_000_000;
    params.bucket_size = bucketSize;
    params.start_time_min = timeBucket;
    params.start_time_max = timeBucket + bucket_size_us - 1;
  } else if (groupBy === 'thread') {
    if (!threadId) {
      throw new Error('threadId is required for groupBy=thread');
    }
    params.thread_ids = threadId;
  } else if (groupBy === 'run') {
    if (!runId) {
      throw new Error('runId is required for groupBy=run');
    }
    // Note: We need to add runIds filter to the backend if it doesn't exist
    // For now, this will return the group containing this run
  }

  const result = await listGroups({
    projectId,
    params,
  });
  return result.data.length > 0 ? result.data[0] : null;
};

/**
 * @deprecated Use fetchSingleGroup with groupBy='time' instead
 */
export const fetchSingleBucket = async (props: {
  timeBucket: number;
  projectId: string;
  bucketSize: number; // In seconds
}): Promise<GenericGroupDTO | null> => {
  return fetchSingleGroup({
    projectId: props.projectId,
    groupBy: 'time',
    timeBucket: props.timeBucket,
    bucketSize: props.bucketSize,
  });
};
