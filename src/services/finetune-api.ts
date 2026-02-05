import { apiClient, handleApiResponse, getAuthToken } from "@/lib/api-client";
import { getBackendUrl } from "@/config/api";
import { DatasetWithRecords, DatasetRecord, DataInfo } from "@/types/dataset-types";
import * as datasetsDB from './datasets-db';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

export interface Hyperparameters {
  batch_size?: number;
  learning_rate_multiplier?: number;
  n_epochs?: number;
}

export interface CreateFinetuningJobRequest {
  dataset: DatasetWithRecords;
  base_model: string;
  provider: string;
  hyperparameters?: Hyperparameters;
  suffix?: string;
}

export interface FinetuningJob {
  id: string;
  provider_job_id?: string;
  status: string;
  base_model: string;
  provider: string;
  hyperparameters?: Hyperparameters;
  suffix?: string;
  training_file_id?: string;
  validation_file_id?: string;
  created_at: string;
  updated_at: string;
  error?: string;
}

// Reinforcement job types
export interface ReinforcementTrainingConfig {
  learning_rate?: number;
  max_context_length?: number;
  lora_rank?: number;
  epochs?: number;
  batch_size?: number;
  gradient_accumulation_steps?: number;
  learning_rate_warmup_steps?: number;
  batch_size_samples?: number;
}

export interface ReinforcementInferenceParameters {
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  response_candidates_count?: number;
}

export interface CreateReinforcementJobRequest {
  dataset: string;
  base_model: string;
  output_model?: string;
  evaluation_dataset?: string;
  display_name?: string;
  training_config?: ReinforcementTrainingConfig;
  inference_parameters?: ReinforcementInferenceParameters;
  chunk_size?: number;
  node_count?: number;
}

// Finetune job status enum
export type FinetuneJobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

// FinetuneJob - matches backend FinetuningJobResponse
export interface FinetuneJob {
  id: string;
  provider_job_id: string;
  dataset_id: string;
  status: FinetuneJobStatus;
  base_model: string;
  fine_tuned_model?: string;
  provider: string;
  training_config?: ReinforcementTrainingConfig;
  suffix?: string;
  error_message?: string;
  training_file_id: string;
  validation_file_id?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

// Legacy type alias for backward compatibility
export type ReinforcementJob = FinetuneJob;

export interface DatasetUploadResponse {
  dataset_id: string;
  [key: string]: unknown;
}

export interface StartFinetuneResult {
  job: ReinforcementJob;
  backendDatasetId: string;
}

export interface DatasetUploadResult {
  backendDatasetId: string;
  jsonlContent: string;
}

// ============================================================================
// Evaluation Types
// ============================================================================

export interface EvaluationCompletionParams {
  model?: string;
  temperature?: number;
  [key: string]: unknown;
}

export interface CreateEvaluationRequest {
  dataset_id: string;
  rollout_model_params: EvaluationCompletionParams;
  offset?: number;
  limit?: number;
}

export interface CreateEvaluationResponse {
  evaluation_run_id: string;
  status: string;
  total_rows: number;
}

export interface RowEvaluationResult {
  dataset_row_id: string;
  row_index: number;
  status: string;
  logs?: string[];
  score?: number;
  reason?: string;
  error_message?: string;
}

export interface EvaluationSummary {
  average_score?: number;
  passed_count: number;
  failed_count: number;
}

export interface EvaluationResultResponse {
  evaluation_run_id: string;
  status: string;
  total_rows: number;
  completed_rows: number;
  failed_rows: number;
  results: RowEvaluationResult[];
  summary: EvaluationSummary;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert a DatasetRecord to OpenAI training format
 * Returns null if the record cannot be converted
 */
function recordToTrainingFormat(record: DatasetRecord): { messages: any[] } | null {
  const data = record.data as DataInfo | { messages?: any[] } | null;
  if (!data) return null;

  // If data already has messages at top level (OpenAI format)
  if ('messages' in data && Array.isArray(data.messages)) {
    return { messages: data.messages };
  }

  // If data has input/output structure (vllora format)
  if ('input' in data && 'output' in data) {
    const dataInfo = data as DataInfo;
    const inputMessages = dataInfo.input?.messages || [];
    const outputMessage = dataInfo.output?.messages;

    // Combine input messages with output message
    const messages = [...inputMessages];
    if (outputMessage) {
      // outputMessage could be a single message or an array
      if (Array.isArray(outputMessage)) {
        messages.push(...outputMessage);
      } else {
        messages.push(outputMessage);
      }
    }

    if (messages.length === 0) return null;
    return { messages };
  }

  return null;
}

/**
 * Convert dataset records to JSONL string for training
 */
export function datasetToJsonl(records: DatasetRecord[]): string {
  const lines: string[] = [];

  for (const record of records) {
    const trainingData = recordToTrainingFormat(record);
    if (trainingData) {
      lines.push(JSON.stringify(trainingData));
    }
  }

  return lines.join('\n');
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Upload a dataset file (JSONL format) to the provider
 * @param jsonlContent - JSONL content for training
 * @param topicHierarchy - Optional topic hierarchy JSON string
 * @param evalScript - Optional JavaScript evaluator script
 */
export async function uploadDataset(
  jsonlContent: string,
  topicHierarchy?: string,
  evalScript?: string
): Promise<DatasetUploadResponse> {
  const apiUrl = getBackendUrl();
  const formData = new FormData();

  // Create a Blob from the JSONL content
  const blob = new Blob([jsonlContent], { type: 'application/x-ndjson' });
  formData.append('file', blob, 'training.jsonl');

  // Add topic hierarchy if provided
  if (topicHierarchy) {
    formData.append('topic_hierarchy', topicHierarchy);
  }

  // Add eval_script and evaluator config if provided
  // Backend requires BOTH: evaluator config (with type: "js") AND eval_script
  // The backend merges eval_script content into evaluator.config.script
  if (evalScript) {
    formData.append('eval_script', evalScript);
    // Must also send evaluator config for backend to merge the script into
    const evaluatorConfig = {
      type: 'js',
      config: {
        script: '', // Will be replaced by eval_script content on backend
        completion_params: {
          model: 'gpt-4o-mini',
          model_name: 'gpt-4o-mini',
          temperature: 0.0,
          max_tokens: 300,
        },
      },
    };
    formData.append('evaluator', JSON.stringify(evaluatorConfig));
  }

  // Build headers
  const headers: Record<string, string> = {};
  const token = await getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${apiUrl}/finetune/datasets`, {
    method: 'POST',
    headers,
    body: formData,
  });

  return handleApiResponse<DatasetUploadResponse>(response);
}

/**
 * Create a reinforcement fine-tuning job
 */
export async function createReinforcementJob(
  request: CreateReinforcementJobRequest
): Promise<ReinforcementJob> {
  const response = await apiClient('/finetune/reinforcement-jobs', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return handleApiResponse<ReinforcementJob>(response);
}

/**
 * List reinforcement fine-tuning jobs
 * @param limit - Maximum number of jobs to return
 * @param after - Cursor for pagination
 * @param datasetId - Optional backend dataset ID to filter jobs by
 */
export async function listReinforcementJobs(
  limit?: number,
  after?: string,
  datasetId?: string
): Promise<ReinforcementJob[]> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (after) params.set('after', after);
  if (datasetId) params.set('dataset_id', datasetId);

  const queryString = params.toString();
  const endpoint = queryString
    ? `/finetune/reinforcement-jobs?${queryString}`
    : '/finetune/reinforcement-jobs';

  const response = await apiClient(endpoint, { method: 'GET' });
  return handleApiResponse<ReinforcementJob[]>(response);
}

/**
 * Get reinforcement job status
 */
export async function getReinforcementJobStatus(jobId: string): Promise<ReinforcementJob> {
  const response = await apiClient(`/finetune/reinforcement-jobs/${jobId}/status`, {
    method: 'GET',
  });
  return handleApiResponse<ReinforcementJob>(response);
}

/**
 * Cancel a reinforcement fine-tuning job
 * @param jobId - The provider job ID to cancel
 */
export async function cancelReinforcementJob(jobId: string): Promise<void> {
  const response = await apiClient(`/finetune/reinforcement-jobs/${jobId}/cancel`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to cancel job' }));
    throw new Error(error.message || 'Failed to cancel job');
  }
}

/**
 * Resume a cancelled reinforcement fine-tuning job
 * @param jobId - The provider job ID to resume
 */
export async function resumeReinforcementJob(jobId: string): Promise<void> {
  const response = await apiClient(`/finetune/reinforcement-jobs/${jobId}/resume`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to resume job' }));
    throw new Error(error.message || 'Failed to resume job');
  }
}

/**
 * Upload a dataset to the backend for finetuning
 * This is step 1 of the finetune process - should be called first so the
 * backendDatasetId can be saved before attempting to create the job
 */
export async function uploadDatasetForFinetune(
  dataset: DatasetWithRecords
): Promise<DatasetUploadResult> {
  // Convert dataset to JSONL
  const jsonlContent = datasetToJsonl(dataset.records);

  if (!jsonlContent.trim()) {
    throw new Error('No valid training records found in dataset');
  }

  // Extract topic hierarchy if available
  const topicHierarchy = dataset.topicHierarchy?.hierarchy
    ? JSON.stringify(dataset.topicHierarchy.hierarchy)
    : undefined;

  // Upload dataset with topic hierarchy and eval script
  const uploadResult = await uploadDataset(jsonlContent, topicHierarchy, dataset.evalScript);

  return {
    backendDatasetId: uploadResult.dataset_id,
    jsonlContent,
  };
}

/**
 * Ensure dataset is uploaded to backend.
 * If already uploaded, returns existing backendDatasetId.
 * If not, uploads the dataset and saves the backendDatasetId.
 *
 * @param datasetId - Local dataset ID
 * @returns backendDatasetId
 * @throws Error if dataset not found, has no records, or upload fails
 */
export async function ensureDatasetUploaded(datasetId: string): Promise<string> {
  const dataset = await datasetsDB.getDatasetById(datasetId);
  if (!dataset) {
    throw new Error('Dataset not found');
  }

  // Already uploaded
  if (dataset.backendDatasetId) {
    return dataset.backendDatasetId;
  }

  // Need to upload
  const records = await datasetsDB.getRecordsByDatasetId(datasetId);
  if (records.length === 0) {
    throw new Error('Dataset has no records');
  }

  toast.info('Uploading dataset to backend...');
  try {
    const uploadResult = await uploadDatasetForFinetune({
      ...dataset,
      records,
    });
    await datasetsDB.updateDatasetBackendId(datasetId, uploadResult.backendDatasetId);
    toast.success('Dataset uploaded successfully');
    return uploadResult.backendDatasetId;
  } catch (uploadError) {
    toast.error('Failed to upload dataset');
    throw uploadError;
  }
}

/** Default training configuration */
export const DEFAULT_TRAINING_CONFIG: ReinforcementTrainingConfig = {
  learning_rate: 0.0001,
  lora_rank: 16,
  epochs: 2.0,
  batch_size: 65536,
};

/** Default inference parameters */
export const DEFAULT_INFERENCE_PARAMETERS: ReinforcementInferenceParameters = {
  max_output_tokens: 2048,
  temperature: 0.7,
  top_p: 0.9,
};

export interface CreateFinetuneJobOptions {
  baseModel?: string;
  outputModel?: string;
  displayName?: string;
  trainingConfig?: Partial<ReinforcementTrainingConfig>;
  inferenceParameters?: Partial<ReinforcementInferenceParameters>;
  /** Chunk size for training data processing */
  chunkSize?: number;
  /** Number of nodes for distributed training */
  nodeCount?: number;
}

/**
 * Create a finetune job using an already-uploaded dataset
 * This is step 2 of the finetune process - call after uploadDatasetForFinetune
 */
export async function createFinetuneJobFromUpload(
  backendDatasetId: string,
  datasetName: string,
  options?: CreateFinetuneJobOptions
): Promise<ReinforcementJob> {
  // Generate output model name from dataset name
  const timestamp = Date.now();
  const safeName = datasetName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const defaultOutputModel = `${safeName}-${timestamp}`;

  // Merge user config with defaults
  const trainingConfig: ReinforcementTrainingConfig = {
    ...DEFAULT_TRAINING_CONFIG,
    ...options?.trainingConfig,
  };

  const inferenceParameters: ReinforcementInferenceParameters = {
    ...DEFAULT_INFERENCE_PARAMETERS,
    ...options?.inferenceParameters,
  };

  // Create reinforcement job request
  const request: CreateReinforcementJobRequest = {
    dataset: backendDatasetId,
    base_model: options?.baseModel || 'llama-v3-8b-instruct',
    output_model: options?.outputModel || defaultOutputModel,
    display_name: options?.displayName || `${datasetName} Fine-tune`,
    training_config: trainingConfig,
    inference_parameters: inferenceParameters,
  };

  // Add optional distributed training parameters
  if (options?.chunkSize !== undefined) {
    request.chunk_size = options.chunkSize;
  }
  if (options?.nodeCount !== undefined) {
    request.node_count = options.nodeCount;
  }

  const job = await createReinforcementJob(request);

  return job;
}

/**
 * Start a finetune job with default configuration (convenience function)
 * This uploads the dataset and creates a reinforcement job in one step
 * Note: For better error handling, use uploadDatasetForFinetune + createFinetuneJobFromUpload
 * to save the backendDatasetId before attempting job creation
 */
export async function startFinetuneJob(
  dataset: DatasetWithRecords,
  options?: {
    baseModel?: string;
    outputModel?: string;
    displayName?: string;
  }
): Promise<StartFinetuneResult> {
  const { backendDatasetId } = await uploadDatasetForFinetune(dataset);
  const job = await createFinetuneJobFromUpload(backendDatasetId, dataset.name, options);
  return { job, backendDatasetId };
}

// Legacy function - kept for backward compatibility
/**
 * Create a new finetuning job from a dataset (legacy)
 * @deprecated Use startFinetuneJob instead
 */
export async function createFinetuningJob(
  request: CreateFinetuningJobRequest
): Promise<FinetuningJob> {
  const response = await apiClient('/finetune/jobs', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return handleApiResponse<FinetuningJob>(response);
}

// ============================================================================
// Evaluation API Functions
// ============================================================================

/**
 * Create an evaluation run for a dataset
 * This runs the configured evaluator/grader on the dataset rows
 * @param request - Evaluation request with dataset_id and model params
 */
export async function createEvaluation(
  request: CreateEvaluationRequest
): Promise<CreateEvaluationResponse> {
  const response = await apiClient('/finetune/evaluations', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return handleApiResponse<CreateEvaluationResponse>(response);
}

/**
 * Get evaluation results for a given evaluation run
 * @param evaluationRunId - The evaluation run ID
 */
export async function getEvaluationResult(
  evaluationRunId: string
): Promise<EvaluationResultResponse> {
  const response = await apiClient(`/finetune/evaluations/${evaluationRunId}`, {
    method: 'GET',
  });
  return handleApiResponse<EvaluationResultResponse>(response);
}

/**
 * Poll for evaluation completion
 * @param evaluationRunId - The evaluation run ID
 * @param maxAttempts - Maximum polling attempts (default 60)
 * @param intervalMs - Polling interval in ms (default 2000)
 */
export async function waitForEvaluationComplete(
  evaluationRunId: string,
  maxAttempts: number = 60,
  intervalMs: number = 2000
): Promise<EvaluationResultResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await getEvaluationResult(evaluationRunId);

    // Check if evaluation is complete
    if (result.status === 'completed' || result.status === 'failed') {
      return result;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Evaluation ${evaluationRunId} did not complete within timeout`);
}

// ============================================================================
// Finetune Evaluation Results Types & API
// ============================================================================

/** Single evaluation result for a row at a specific epoch */
export interface EpochEvalResult {
  score?: number;
  reason?: string;
  status?: string;
  logs?: string[];
  [key: string]: unknown;
}

/** Results for a single dataset row across epochs */
export interface RowEpochResults {
  row_index: number;
  row: Record<string, unknown>;
  /** Map of epoch number to array of evaluation results */
  epochs: Record<number, EpochEvalResult[]>;
}

/** Response from finetune evaluations endpoint */
export interface FinetuneEvalResultsResponse {
  results: RowEpochResults[];
}

/**
 * Get finetune evaluation results for a dataset/job
 * Shows how the model performs on each row across training epochs
 * @param datasetId - The backend dataset ID
 * @param finetuneJobId - Optional job ID to filter results
 * @param rowIndex - Optional row index to filter
 * @param epoch - Optional epoch to filter
 */
export async function getFinetuneEvaluations(
  datasetId: string,
  finetuneJobId?: string,
  rowIndex?: number,
  epoch?: number
): Promise<FinetuneEvalResultsResponse> {
  const params = new URLSearchParams();
  if (finetuneJobId) params.set('finetune_job_id', finetuneJobId);
  if (rowIndex !== undefined) params.set('row_index', String(rowIndex));
  if (epoch !== undefined) params.set('epoch', String(epoch));

  const queryString = params.toString();
  const endpoint = queryString
    ? `/finetune/datasets/${datasetId}/finetune-evaluations?${queryString}`
    : `/finetune/datasets/${datasetId}/finetune-evaluations`;

  const response = await apiClient(endpoint, { method: 'GET' });
  return handleApiResponse<FinetuneEvalResultsResponse>(response);
}

// ============================================================================
// Dataset Evaluator Update API Functions
// ============================================================================

export interface UpdateEvaluatorResponse {
  dataset_id: string;
  updated: boolean;
}

// ============================================================================
// Dataset Analytics Types
// ============================================================================

export interface DryRunAnalyticsRequest {
  rows: unknown[];
}

export interface DryRunAnalyticsResponse {
  analytics: Record<string, unknown>;
  quality: Record<string, unknown>;
}

/**
 * Update the eval script for an existing backend dataset
 * @param datasetId - The backend dataset ID
 * @param script - The JavaScript evaluator script
 */
export async function updateDatasetEvalScript(
  datasetId: string,
  script: string
): Promise<UpdateEvaluatorResponse> {
  const evaluator = {
    type: 'js',
    config: {
      script,
      completion_params: {
        model: 'gpt-4o-mini',
      },
    },
  };
  const response = await apiClient(`/finetune/datasets/${datasetId}/evaluator`, {
    method: 'PATCH',
    body: JSON.stringify({ evaluator }),
  });
  return handleApiResponse<UpdateEvaluatorResponse>(response);
}

// ============================================================================
// Dataset Analytics API Functions
// ============================================================================

/**
 * Run dry-run analytics on dataset rows without uploading
 * Computes quality metrics and analytics for the provided rows
 * @param rows - Array of dataset rows to analyze
 */
export async function getDryRunAnalytics(
  rows: unknown[]
): Promise<DryRunAnalyticsResponse> {
  const response = await apiClient('/finetune/datasets/analytics/dry-run', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  });
  return handleApiResponse<DryRunAnalyticsResponse>(response);
}
