import { Pagination, RunDTO, Span, ModelCall, ToolCall, RouterCall, Attributes } from '@/types/common-type';
import { apiClient, handleApiResponse } from '@/lib/api-client';

// Re-export types for convenience
export type { Pagination, RunDTO, Span, ModelCall, ToolCall, RouterCall, Attributes };


export interface PaginatedRunsResponse {
  data: RunDTO[];
  pagination: Pagination;
}

export interface ListRunsQuery {
  // Backend expects comma-separated strings, not arrays
  run_ids?: string; // Changed from runId to runIds (comma-separated)
  thread_ids?: string; // Changed from string[] to string (comma-separated)
  trace_ids?: string; // Added traceIds (comma-separated)
  model_name?: string;
  type_filter?: string; // This is the display_type parameter
  include_mcp_templates?: boolean;
  // Pagination
  offset?: number;
  limit?: number;

  // Time filter fields - backend uses flattened TimeFilter
  // Option 1: Use predefined periods (preferred for shortcuts)
  period?:
    | 'last_minute'
    | 'last15_minute'
    | 'last_15_minutes'
    | 'last_hour'
    | 'last3_hours'
    | 'last_3_hours'
    | 'last12_hours'
    | 'last_12_hours'
    | 'last_day'
    | 'last_week'
    | 'last_month'
    | 'last_year';

  // Option 2: Use absolute timestamps (for custom date ranges)
  // Using current field names (backend converts seconds to microseconds)
  startTime?: number; // In seconds - backend multiplies by 1,000,000
  endTime?: number; // In seconds - backend multiplies by 1,000,000

  // Legacy fields (still supported via aliases but deprecated)
  startTimeUs?: number; // In microseconds (deprecated)
  endTimeUs?: number; // In microseconds (deprecated)
}

export const listRuns = async (props: {
  projectId: string;
  params?: ListRunsQuery;
}): Promise<PaginatedRunsResponse> => {
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
  if (!params?.run_ids) {
    delete sendParams.run_ids;
  }

  // Build query string
  const queryParams = new URLSearchParams();
  Object.entries({
    ...(sendParams || {}),
    include_mcp_templates: params?.type_filter === 'mcp',
  }).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.append(key, String(value));
    }
  });

  const endpoint = `/runs?${queryParams.toString()}`;
  const response = await apiClient(endpoint, {
    method: 'GET',
    headers: {
      'x-project-id': projectId,
    },
  });

  return handleApiResponse<PaginatedRunsResponse>(response);
};

export const fetchRunSpans = async (props: {
  runId: string;
  projectId: string;
  offset: number;
  limit: number;
}): Promise<{ data: Span[]; pagination: Pagination }> => {
  const { runId, projectId, offset, limit } = props;

  // Build query string
  const queryParams = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });

  const endpoint = `/runs/${runId}?${queryParams.toString()}`;

  const response = await apiClient(endpoint, {
    method: 'GET',
    headers: {
      'x-project-id': projectId,
    },
  });

  return handleApiResponse<{ data: Span[]; pagination: Pagination }>(response);
};
