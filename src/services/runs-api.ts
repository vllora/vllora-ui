import { API_CONFIG } from '@/config/api';

export interface RunDTO {
  run_id: string | null;
  thread_ids: string[];
  trace_ids: string[];
  used_models: string[];
  request_models: string[];
  used_tools: string[];
  mcp_template_definition_ids: string[];
  cost: number;
  input_tokens: number;
  output_tokens: number;
  start_time_us: number;
  finish_time_us: number;
  errors: string[];
}

export interface Pagination {
  offset: number;
  limit: number;
  total: number;
}

export interface PaginatedRunsResponse {
  data: RunDTO[];
  pagination: Pagination;
}

export interface ListRunsQuery {
  // Backend expects comma-separated strings, not arrays
  runIds?: string; // Changed from runId to runIds (comma-separated)
  threadIds?: string; // Changed from string[] to string (comma-separated)
  traceIds?: string; // Added traceIds (comma-separated)
  modelName?: string;
  typeFilter?: string; // This is the display_type parameter
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
  if (!params?.threadIds) {
    delete sendParams.threadIds;
  }
  if (!params?.traceIds) {
    delete sendParams.traceIds;
  }
  if (!params?.runIds) {
    delete sendParams.runIds;
  }

  // Build query string
  const queryParams = new URLSearchParams();
  Object.entries({
    ...(sendParams || {}),
    include_mcp_templates: params?.typeFilter === 'mcp',
  }).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.append(key, String(value));
    }
  });

  const url = `${API_CONFIG.url}/runs?${queryParams.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-project-id': projectId,
      authorization: `Bearer ${API_CONFIG.apiKey}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || errorData.error || `Failed to fetch runs: ${response.statusText}`
    );
  }

  return await response.json();
};
