import { api, handleApiResponse } from '@/lib/api-client';

export interface Experiment {
  id: string;
  name: string;
  description?: string;
  original_span_id: string;
  original_trace_id: string;
  original_request: string;
  modified_request: string;
  headers?: string;
  prompt_variables?: string;
  model_parameters?: string;
  result_span_id?: string;
  result_trace_id?: string;
  status: string;
  project_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateExperimentRequest {
  name: string;
  description?: string;
  original_span_id: string;
  original_trace_id: string;
  original_request: Record<string, any>;
  modified_request: Record<string, any>;
  headers?: Record<string, string>;
  prompt_variables?: Record<string, string>;
  model_parameters?: Record<string, any>;
}

export interface UpdateExperimentRequest {
  name?: string;
  description?: string;
  modified_request?: Record<string, any>;
  headers?: Record<string, string>;
  prompt_variables?: Record<string, string>;
  model_parameters?: Record<string, any>;
  result_span_id?: string;
  result_trace_id?: string;
  status?: string;
}

/**
 * List all experiments
 */
export async function listExperiments(): Promise<Experiment[]> {
  const response = await api.get('/experiments');
  const data = await handleApiResponse<Experiment[]>(response);
  return Array.isArray(data) ? data : [];
}

/**
 * Get a specific experiment by ID
 */
export async function getExperiment(experimentId: string): Promise<Experiment> {
  const response = await api.get(`/experiments/${experimentId}`);
  return handleApiResponse<Experiment>(response);
}

/**
 * Get experiments by span ID
 */
export async function getExperimentsBySpan(spanId: string): Promise<Experiment[]> {
  const response = await api.get(`/experiments/by-span/${spanId}`);
  const data = await handleApiResponse<Experiment[]>(response);
  return Array.isArray(data) ? data : [];
}

/**
 * Create a new experiment
 */
export async function createExperiment(request: CreateExperimentRequest): Promise<Experiment> {
  const response = await api.post('/experiments', request);
  return handleApiResponse<Experiment>(response);
}

/**
 * Update an existing experiment
 */
export async function updateExperiment(
  experimentId: string,
  request: UpdateExperimentRequest
): Promise<Experiment> {
  const response = await api.put(`/experiments/${experimentId}`, request);
  return handleApiResponse<Experiment>(response);
}

/**
 * Delete an experiment
 */
export async function deleteExperiment(experimentId: string): Promise<void> {
  const response = await api.delete(`/experiments/${experimentId}`);
  await handleApiResponse<void>(response);
}
