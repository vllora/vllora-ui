/**
 * Distri Data Tool Handlers
 *
 * These tools fetch data from the vLLora backend.
 * All tools use external = ["*"], meaning they are handled here in the frontend.
 *
 * These tools REUSE existing vLLora API services to ensure consistency
 * with the UI and avoid code duplication.
 *
 * Existing services used:
 * - @/services/runs-api.ts   -> listRuns, getRunDetails
 * - @/services/spans-api.ts  -> listSpans
 * - @/services/groups-api.ts -> listGroups
 *
 * IMPORTANT: API services use different field naming conventions:
 * - runs-api.ts uses snake_case: thread_ids, run_ids, model_name
 * - spans-api.ts uses camelCase: threadIds, runIds, operationNames
 * - groups-api.ts uses snake_case: thread_ids, group_by, bucket_size
 */

import { DistriFnTool } from '@distri/core';
import { listRuns, getRunDetails, type ListRunsQuery } from '@/services/runs-api';
import { listSpans, type ListSpansQuery } from '@/services/spans-api';
import { listGroups, type ListGroupsQuery } from '@/services/groups-api';

// Data tool names (4 tools)
export const DATA_TOOL_NAMES = [
  'fetch_runs',
  'fetch_spans',
  'get_run_details',
  'fetch_groups',
] as const;

export type DataToolName = (typeof DATA_TOOL_NAMES)[number];

import { listProjects } from '@/services/projects-api';

// Cache for the default project ID
let cachedDefaultProjectId: string | null = null;

/**
 * Get current project ID from URL, localStorage, or fetch from API
 * Priority: URL params > localStorage > cached default > fetch default
 */
async function getCurrentProjectId(): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Cannot get project ID in server context');
  }

  // First try URL params
  const params = new URLSearchParams(window.location.search);
  const urlProjectId = params.get('project_id') || params.get('projectId');
  if (urlProjectId) return urlProjectId;

  // Then try localStorage (set by ProjectDropdown when user selects a project)
  const storedProjectId = localStorage.getItem('currentProjectId');
  if (storedProjectId) return storedProjectId;

  // Use cached default if available
  if (cachedDefaultProjectId) return cachedDefaultProjectId;

  // Fetch default project from API
  try {
    const projects = await listProjects();
    const defaultProject = projects.find(p => p.is_default) || projects[0];
    if (defaultProject) {
      cachedDefaultProjectId = defaultProject.id;
      // Also cache in localStorage for next time
      localStorage.setItem('currentProjectId', defaultProject.id);
      return defaultProject.id;
    }
  } catch (error) {
    console.error('[distri-data-tools] Failed to fetch default project:', error);
  }

  throw new Error('No project ID available. Please select a project or add project_id to URL.');
}

/**
 * Helper to convert array to comma-separated string (API format)
 */
function toCommaSeparated(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value.join(',') : value;
}

// ============================================================================
// Data Tool Handlers
// ============================================================================

export const dataToolHandlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
  /**
   * Fetch runs with filtering
   * Reuses: @/services/runs-api.ts -> listRuns
   *
   * @param threadIds - Filter by thread IDs (string or array)
   * @param runIds - Filter by run IDs (string or array)
   * @param modelName - Filter by model name
   * @param limit - Max results (default: 50)
   * @param offset - Pagination offset
   * @param period - Time filter: 'last_hour', 'last_day', 'last_week', etc.
   * @param projectId - Project ID (defaults to current)
   */
  fetch_runs: async (params) => {
    try {
      const projectId = (params.projectId as string) || await getCurrentProjectId();

      const query: ListRunsQuery = {};

      // Convert agent params (camelCase) to API params (snake_case for runs-api)
      if (params.threadIds) query.thread_ids = toCommaSeparated(params.threadIds as string | string[]);
      if (params.runIds) query.run_ids = toCommaSeparated(params.runIds as string | string[]);
      if (params.modelName) query.model_name = params.modelName as string;
      if (params.limit) query.limit = params.limit as number;
      if (params.offset) query.offset = params.offset as number;
      if (params.period) query.period = params.period as ListRunsQuery['period'];

      const result = await listRuns({ projectId, params: query });

      return {
        success: true,
        data: result.data,
        pagination: result.pagination,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch runs',
      };
    }
  },

  /**
   * Fetch spans with filtering
   * Reuses: @/services/spans-api.ts -> listSpans
   *
   * @param threadIds - Filter by thread IDs (string or array)
   * @param runIds - Filter by run IDs (string or array)
   * @param operationNames - Filter by operation types (string or array)
   * @param parentSpanIds - Filter by parent span IDs (string or array)
   * @param limit - Max results (default: 100)
   * @param offset - Pagination offset
   * @param projectId - Project ID (defaults to current)
   */
  fetch_spans: async (params) => {
    try {
      const projectId = (params.projectId as string) || await getCurrentProjectId();

      const query: ListSpansQuery = {};

      // spans-api uses camelCase, just pass through with conversion
      if (params.threadIds) query.threadIds = toCommaSeparated(params.threadIds as string | string[]);
      if (params.runIds) query.runIds = toCommaSeparated(params.runIds as string | string[]);
      if (params.operationNames) query.operationNames = toCommaSeparated(params.operationNames as string | string[]);
      if (params.parentSpanIds) query.parentSpanIds = toCommaSeparated(params.parentSpanIds as string | string[]);
      if (params.limit) query.limit = params.limit as number;
      if (params.offset) query.offset = params.offset as number;

      const result = await listSpans({ projectId, params: query });

      return {
        success: true,
        data: result.data,
        pagination: result.pagination,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch spans',
      };
    }
  },

  /**
   * Get detailed information about a specific run
   * Reuses: @/services/runs-api.ts -> getRunDetails
   *
   * @param runId - Required: The run ID to fetch details for
   * @param projectId - Project ID (defaults to current)
   */
  get_run_details: async (params) => {
    try {
      const runId = params.runId as string;
      if (!runId) {
        return { success: false, error: 'runId is required' };
      }

      const projectId = (params.projectId as string) || await getCurrentProjectId();
      const result = await getRunDetails({ runId, projectId });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch run details',
      };
    }
  },

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
  fetch_groups: async (params) => {
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
  },
};

/**
 * Check if a tool name is a Data tool
 */
export function isDataTool(toolName: string): toolName is DataToolName {
  return DATA_TOOL_NAMES.includes(toolName as DataToolName);
}

/**
 * Execute a Data tool by name
 */
export async function executeDataTool(
  toolName: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const handler = dataToolHandlers[toolName];
  if (!handler) {
    throw new Error(`Unknown Data tool: ${toolName}`);
  }
  return handler(params);
}

// ============================================================================
// DistriFnTool[] format for Chat component
// ============================================================================

/**
 * Data tools in DistriFnTool format for use with @distri/react Chat component
 */
export const dataTools: DistriFnTool[] = [
  {
    name: 'fetch_runs',
    description: 'Fetch a list of runs with optional filtering by thread, run IDs, model, or time period',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        threadIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by thread IDs',
        },
        runIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by run IDs',
        },
        modelName: { type: 'string', description: 'Filter by model name' },
        limit: { type: 'number', description: 'Maximum number of results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
        period: {
          type: 'string',
          enum: ['last_hour', 'last_day', 'last_week', 'last_month'],
          description: 'Time period filter',
        },
        projectId: { type: 'string', description: 'Project ID (defaults to current)' },
      },
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.fetch_runs(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'fetch_spans',
    description: 'Fetch spans with optional filtering by thread, run, operation type, or parent span',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        threadIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by thread IDs',
        },
        runIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by run IDs',
        },
        operationNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by operation names (e.g., llm_call, tool_call)',
        },
        parentSpanIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by parent span IDs',
        },
        limit: { type: 'number', description: 'Maximum number of results (default: 100)' },
        offset: { type: 'number', description: 'Pagination offset' },
        projectId: { type: 'string', description: 'Project ID (defaults to current)' },
      },
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.fetch_spans(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'get_run_details',
    description: 'Get detailed information about a specific run including all its spans',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'The run ID to fetch details for' },
        projectId: { type: 'string', description: 'Project ID (defaults to current)' },
      },
      required: ['runId'],
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.get_run_details(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'fetch_groups',
    description: 'Fetch aggregated groups by time, thread, or run',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        groupBy: {
          type: 'string',
          enum: ['time', 'thread', 'run'],
          description: 'How to group the results (default: time)',
        },
        threadIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by thread IDs',
        },
        modelName: { type: 'string', description: 'Filter by model name' },
        bucketSize: { type: 'number', description: 'Time bucket size in seconds (for groupBy=time)' },
        limit: { type: 'number', description: 'Maximum number of results' },
        offset: { type: 'number', description: 'Pagination offset' },
        projectId: { type: 'string', description: 'Project ID (defaults to current)' },
      },
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.fetch_groups(input as Record<string, unknown>)),
  } as DistriFnTool,
];
