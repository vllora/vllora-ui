import { apiClient, handleApiResponse } from "@/lib/api-client";
import {
  DatasetWithRecords,
  DatasetRecord,
  DataInfo,
} from "@/types/dataset-types";


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

// Finetune job types
export interface FinetuneTrainingConfig {
  learning_rate?: number;
  max_context_length?: number;
  lora_rank?: number;
  epochs?: number;
  batch_size?: number;
  gradient_accumulation_steps?: number;
  learning_rate_warmup_steps?: number;
  batch_size_samples?: number;
}

export interface FinetuneInferenceParameters {
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  response_candidates_count?: number;
}

/** Unified job type for the POST /jobs endpoint */
export type JobType = "provider_finetune" | "evaluation_run";

export interface CreateFinetuneJobRequest {
  job_type: JobType;
  dataset?: string;
  base_model?: string;
  output_model?: string;
  evaluation_dataset?: string;
  display_name?: string;
  training_config?: FinetuneTrainingConfig;
  inference_parameters?: FinetuneInferenceParameters;
  chunk_size?: number;
  node_count?: number;
  /** Evaluator version to use during training. If omitted, uses the latest version. */
  evaluator_version?: number;
  /** Rollout model params for evaluation_run jobs */
  rollout_model_params?: {
    model: string;
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  };
  offset?: number;
  limit?: number;
}

// ============================================================================
// Evaluator Version Types
// ============================================================================

export interface EvaluatorVersionResponse {
  id: string;
  workflow_id: string;
  version: number;
  config: {
    type: 'js' | 'llm_as_judge';
    config: Record<string, unknown>;
  };
  /** Git-style diff between this version and the previous one */
  diff: string | null;
  created_at: string;
}

// ============================================================================
// Finetune Training Metrics Types
// ============================================================================

/** A single point in the training metrics time series */
export interface FinetuneJobMetricPoint {
  /** Raw metrics JSON blob from the training provider */
  metrics: TrainingMetricsSnapshot;
  created_at: string;
}

/** Response from GET /finetune/workflows/{workflowId}/jobs/{jobId}/metrics */
export interface FinetuneJobMetricsResponse {
  provider_job_id: string;
  metrics: FinetuneJobMetricPoint[];
}

/** Typed training metrics snapshot from GRPO/GSPO fine-tuning */
export interface TrainingMetricsSnapshot {
  // Progress / Schedule
  global_step?: number;
  max_steps?: number;
  epoch?: number;
  learning_rate?: number;

  // Reward Quality
  reward?: number;
  reward_std?: number;
  frac_reward_zero_std?: number;
  'rewards/vllora_reward_fn/mean'?: number;
  'rewards/vllora_reward_fn/std'?: number;

  // Optimization / Stability
  loss?: number;
  grad_norm?: number;
  kl?: number;

  // Clipping / PPO-style
  'clip_ratio/low_mean'?: number;
  'clip_ratio/low_min'?: number;
  'clip_ratio/high_mean'?: number;
  'clip_ratio/high_max'?: number;
  'clip_ratio/region_mean'?: number;

  // Sequence / Generation Behavior
  num_tokens?: number;
  completion_length?: number;
  'completions/mean_length'?: number;
  'completions/min_length'?: number;
  'completions/max_length'?: number;
  'completions/clipped_ratio'?: number;
  'completions/mean_terminated_length'?: number;
  'completions/min_terminated_length'?: number;
  'completions/max_terminated_length'?: number;

  // Allow additional unknown metrics
  [key: string]: number | string | undefined;
}

// Finetune job status enum
export type FinetuneJobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

// FinetuneJob - matches backend FinetuningJobResponse
export interface FinetuneJob {
  id: string;
  provider_job_id: string;
  workflow_id: string;
  status: FinetuneJobStatus;
  base_model: string;
  fine_tuned_model?: string;
  provider: string;
  training_config?: FinetuneTrainingConfig;
  suffix?: string;
  error_message?: string;
  training_file_id: string;
  validation_file_id?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  /** Evaluator version used for this job (extracted from request blob) */
  evaluator_version?: number;
}


/** Normalize a job response that may have `dataset_id` (cloud) instead of `workflow_id` (gateway). */
function normalizeFinetuneJob(raw: Record<string, unknown>): FinetuneJob {
  if (!raw.workflow_id && raw.dataset_id) {
    raw.workflow_id = raw.dataset_id;
  }
  // Extract evaluator_version from the request JSON blob if not at top level
  if (raw.evaluator_version == null && raw.request != null) {
    const request = raw.request as Record<string, unknown>;
    if (typeof request.evaluator_version === "number") {
      raw.evaluator_version = request.evaluator_version;
    }
  }
  return raw as unknown as FinetuneJob;
}

export interface DatasetUploadResponse {
  workflow_id: string;
  [key: string]: unknown;
}

export interface StartFinetuneResult {
  job: FinetuneJob;
  workflowId: string;
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
  workflow_id: string;
  rollout_model_params: EvaluationCompletionParams;
  offset?: number;
  limit?: number;
}

export interface CreateEvaluationResponse {
  evaluation_run_id: string;
  status: string;
  total_rows: number;
}

/** Individual evaluation entry within an epoch */
export interface EpochEntry {
  dataset_row_id?: string;
  /** Cloud DB row ID — matches our local record ID (same UUID used as PK) */
  workflow_row_id?: string;
  status?: string;
  score?: number | null;
  reason?: string | null;
  error_message?: string | null;
  logs?: string[] | null;
}

/** The row data object returned by the evaluation API.
 *  `id` is the record's IndexedDB id, allowing mapping back to local records. */
export interface EvaluationRowData {
  id: string;
  messages: unknown[];
  [key: string]: unknown;
}

/** Row-level result with epoch-based evaluation data (matches cloud API) */
export interface RowEpochResult {
  row_index: number;
  row?: EvaluationRowData;
  epochs: Record<string, EpochEntry[]>;
}

export interface EvaluationSummary {
  average_score?: number | null;
  passed_count: number;
  failed_count: number;
}

export interface EvaluationResultResponse {
  evaluation_run_id: string;
  status: string;
  total_rows: number;
  completed_rows: number;
  failed_rows: number;
  results: RowEpochResult[];
  summary: EvaluationSummary | null;
}

/** Flattened evaluation result for UI consumption (one entry per row) */
export interface FlatEvaluationResult {
  dataset_row_id: string;
  row_index: number;
  row?: EvaluationRowData;
  status: string;
  score?: number;
  reason?: string;
  error_message?: string;
  logs?: string[];
  /** Latest epoch number (1-based) — present for finetune per-row results */
  epoch?: number;
  /** Score change from previous epoch — present when multiple epochs exist */
  trend?: number;
}


/** Flatten epoch-based results into a flat array for UI consumption.
 *  Takes the first epoch entry per row (epoch "0" for dry runs). */
export function flattenEvaluationResults(
  results: RowEpochResult[],
): FlatEvaluationResult[] {
  const flat: FlatEvaluationResult[] = [];
  for (const row of results) {
    if (!row.epochs) continue;
    for (const entries of Object.values(row.epochs)) {
      for (const entry of entries) {
        flat.push({
          dataset_row_id: entry.dataset_row_id ?? entry.workflow_row_id ?? row.row?.id ?? "",
          row_index: row.row_index,
          row: row.row,
          status: entry.status ?? "pending",
          score: entry.score ?? undefined,
          reason: entry.reason ?? undefined,
          error_message: entry.error_message ?? undefined,
          logs: entry.logs ?? undefined,
        });
      }
    }
  }
  return flat;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert a DatasetRecord to OpenAI training format
 * Returns null if the record cannot be converted
 */
function recordToTrainingFormat(
  record: DatasetRecord,
): { messages: any[]; id: string } | null {
  const data = record.data as DataInfo | { messages?: any[] } | null;
  if (!data) return null;

  // If data already has messages at top level (OpenAI format)
  if ("messages" in data && Array.isArray(data.messages)) {
    return { messages: data.messages, id: record.id };
  }

  // If data has input/output structure (vllora format)
  if ("input" in data && "output" in data) {
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

    return { messages, id: record.id };
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

  return lines.join("\n");
}

// ============================================================================
// API Functions
// ============================================================================

// NOTE: uploadDataset() was removed — the gateway auto-uploads via ensure_dataset_uploaded()
// inside create_evaluation and create_finetune_job handlers.

/**
 * Create a finetune job
 * @param workflowId - The workflow ID (same as dataset ID)
 * @param request - Job creation request
 */
export async function createFinetuneJob(
  workflowId: string,
  request: CreateFinetuneJobRequest,
): Promise<FinetuneJob> {
  const response = await apiClient(`/finetune/workflows/${workflowId}/jobs`, {
    method: "POST",
    body: JSON.stringify(request),
  });
  const raw = await handleApiResponse<Record<string, unknown>>(response);
  return normalizeFinetuneJob(raw);
}

/**
 * List finetune jobs for a workflow
 * @param workflowId - The workflow ID (same as dataset ID) — scopes the listing
 * @param limit - Maximum number of jobs to return
 * @param after - Cursor for pagination
 */
export async function listFinetuneJobs(
  workflowId: string,
  limit?: number,
  after?: string,
): Promise<FinetuneJob[]> {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (after) params.set("after", after);

  const queryString = params.toString();
  const base = `/finetune/workflows/${workflowId}/jobs`;
  const endpoint = queryString ? `${base}?${queryString}` : base;

  const response = await apiClient(endpoint, { method: "GET" });
  const rawJobs = await handleApiResponse<Record<string, unknown>[]>(response);
  return rawJobs.map(normalizeFinetuneJob);
}

/**
 * Get finetune job status
 * @param workflowId - The workflow ID (same as dataset ID)
 * @param jobId - The job ID
 */
export async function getFinetuneJobStatus(
  workflowId: string,
  jobId: string,
): Promise<FinetuneJob> {
  const response = await apiClient(
    `/finetune/workflows/${workflowId}/jobs/${jobId}/status`,
    {
      method: "GET",
    },
  );
  return handleApiResponse<FinetuneJob>(response);
}

/**
 * Cancel a finetune job
 * @param workflowId - The workflow ID (same as dataset ID)
 * @param jobId - The provider job ID to cancel
 */
export async function cancelFinetuneJob(workflowId: string, jobId: string): Promise<void> {
  const response = await apiClient(
    `/finetune/workflows/${workflowId}/jobs/${jobId}/cancel`,
    {
      method: "POST",
    },
  );
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "Failed to cancel job" }));
    throw new Error(error.message || "Failed to cancel job");
  }
}

/**
 * Resume a cancelled finetune job
 * @param workflowId - The workflow ID (same as dataset ID)
 * @param jobId - The provider job ID to resume
 */
export async function resumeFinetuneJob(workflowId: string, jobId: string): Promise<void> {
  const response = await apiClient(
    `/finetune/workflows/${workflowId}/jobs/${jobId}/resume`,
    {
      method: "POST",
    },
  );
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "Failed to resume job" }));
    throw new Error(error.message || "Failed to resume job");
  }
}

export interface WeightsDownloadUrlResponse {
  download_url: string;
  expires_at?: string;
}

/**
 * Get a signed URL to download trained weights for a completed finetune job
 * @param workflowId - The workflow ID (same as dataset ID)
 * @param jobId - The provider job ID
 */
export async function getWeightsDownloadUrl(
  workflowId: string,
  jobId: string,
): Promise<WeightsDownloadUrlResponse> {
  const response = await apiClient(
    `/finetune/workflows/${workflowId}/jobs/${jobId}/weights/url`,
    {
      method: "GET",
    },
  );
  return handleApiResponse<WeightsDownloadUrlResponse>(response);
}

// NOTE: uploadDatasetForFinetune() was removed — the gateway auto-uploads
// via ensure_dataset_uploaded() inside create_evaluation / create_finetune_job.


/** Default training configuration */
export const DEFAULT_TRAINING_CONFIG: FinetuneTrainingConfig = {
  learning_rate: 0.00001,
  lora_rank: 8,
  gradient_accumulation_steps: 5,
  epochs: 2.0,
  batch_size: 5,
};

/** Default inference parameters */
export const DEFAULT_INFERENCE_PARAMETERS: FinetuneInferenceParameters = {
  max_output_tokens: 1000,
  temperature: 1.0,
  top_p: 1.0,
  response_candidates_count: 2,
};

export interface CreateFinetuneJobOptions {
  baseModel?: string;
  outputModel?: string;
  displayName?: string;
  trainingConfig?: Partial<FinetuneTrainingConfig>;
  inferenceParameters?: Partial<FinetuneInferenceParameters>;
  /** Chunk size for training data processing */
  chunkSize?: number;
  /** Number of nodes for distributed training */
  nodeCount?: number;
  /** Evaluator version to use during training. If omitted, uses the latest version. */
  evaluatorVersion?: number;
}

/**
 * Create a finetune job using an already-uploaded dataset
 * This is step 2 of the finetune process - call after uploadDatasetForFinetune
 */
export async function createFinetuneJobFromUpload(
  workflowId: string,
  datasetName: string,
  options?: CreateFinetuneJobOptions,
): Promise<FinetuneJob> {
  // Generate output model name from dataset name
  const timestamp = Date.now();
  const safeName = datasetName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 30);
  const defaultOutputModel = `${safeName}-${timestamp}`;

  // Merge user config with defaults
  const trainingConfig: FinetuneTrainingConfig = {
    ...DEFAULT_TRAINING_CONFIG,
    ...options?.trainingConfig,
  };

  const inferenceParameters: FinetuneInferenceParameters = {
    ...DEFAULT_INFERENCE_PARAMETERS,
    ...options?.inferenceParameters,
  };

  // Create finetune job request
  const request: CreateFinetuneJobRequest = {
    job_type: "provider_finetune",
    dataset: workflowId,
    base_model: options?.baseModel || "unsloth/Qwen3.5-4B",
    output_model: options?.outputModel || defaultOutputModel,
    display_name: options?.displayName || `${datasetName} Fine-tune`,
    training_config: trainingConfig,
    inference_parameters: inferenceParameters,
  };

  // Add optional parameters
  if (options?.chunkSize !== undefined) {
    request.chunk_size = options.chunkSize;
  }
  if (options?.nodeCount !== undefined) {
    request.node_count = options.nodeCount;
  }
  if (options?.evaluatorVersion !== undefined) {
    request.evaluator_version = options.evaluatorVersion;
  }

  const job = await createFinetuneJob(workflowId, request);

  return job;
}

// NOTE: startFinetuneJob() was removed — use createFinetuneJob() directly.
// The gateway auto-uploads via ensure_dataset_uploaded().

// Legacy function - kept for backward compatibility
/**
 * Create a new finetuning job from a dataset (legacy)
 * @deprecated Use startFinetuneJob instead
 */
export async function createFinetuningJob(
  request: CreateFinetuningJobRequest,
): Promise<FinetuningJob> {
  const response = await apiClient("/finetune/jobs", {
    method: "POST",
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
 * @param request - Evaluation request with workflow_id and model params
 */
export async function createEvaluation(
  request: CreateEvaluationRequest,
): Promise<CreateEvaluationResponse> {
  const response = await apiClient("/finetune/evaluations", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return handleApiResponse<CreateEvaluationResponse>(response);
}

/**
 * Get evaluation results for a given evaluation run
 * @param evaluationRunId - The evaluation run ID
 */
export async function getEvaluationResult(
  evaluationRunId: string,
): Promise<EvaluationResultResponse> {
  const response = await apiClient(`/finetune/evaluations/${evaluationRunId}`, {
    method: "GET",
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
  intervalMs: number = 2000,
): Promise<EvaluationResultResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await getEvaluationResult(evaluationRunId);

    // Check if evaluation is complete
    if (result.status === "completed" || result.status === "failed") {
      return result;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Evaluation ${evaluationRunId} did not complete within timeout`,
  );
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
  row: EvaluationRowData;
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
 * @param workflowId - The backend dataset ID
 * @param finetuneJobId - Optional job ID to filter results
 * @param rowIndex - Optional row index to filter
 * @param epoch - Optional epoch to filter
 */
export async function getFinetuneEvaluations(
  workflowId: string,
  finetuneJobId?: string,
  rowIndex?: number,
  epoch?: number,
): Promise<FinetuneEvalResultsResponse> {
  const params = new URLSearchParams();
  if (finetuneJobId) params.set("finetune_job_id", finetuneJobId);
  if (rowIndex !== undefined) params.set("row_index", String(rowIndex));
  if (epoch !== undefined) params.set("epoch", String(epoch));

  const queryString = params.toString();
  const endpoint = queryString
    ? `/finetune/workflows/${workflowId}/finetune-evaluations?${queryString}`
    : `/finetune/workflows/${workflowId}/finetune-evaluations`;

  const response = await apiClient(endpoint, { method: "GET" });
  return handleApiResponse<FinetuneEvalResultsResponse>(response);
}

// ============================================================================
// Dataset Evaluator Update API Functions
// ============================================================================

export interface UpdateEvaluatorResponse {
  workflow_id: string;
  updated: boolean;
}

// ============================================================================
// Dataset Analytics Types
// ============================================================================

export interface EvalAnalyticsRequest {
  rows: unknown[];
}

export interface EvalAnalyticsResponse {
  analytics: Record<string, unknown>;
  quality: Record<string, unknown>;
}

/**
 * Update the eval script for an existing backend dataset
 * @param workflowId - The backend dataset ID
 * @param script - The JavaScript evaluator script
 */
export async function updateDatasetEvalScript(
  workflowId: string,
  script: string,
): Promise<UpdateEvaluatorResponse> {
  // const evaluator = {
  //   type: 'js',
  //   config: {
  //     script,
  //     completion_params: {
  //       model: 'gpt-4o-mini',
  //     },
  //   },
  // };
  const response = await apiClient(
    `/finetune/workflows/${workflowId}/evaluator`,
    {
      method: "PATCH",
      body: JSON.stringify({ evaluator: { type: "js", config: { script } } }),
    },
  );
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
  rows: unknown[],
): Promise<EvalAnalyticsResponse> {
  const response = await apiClient("/finetune/analytics/dry-run", {
    method: "POST",
    body: JSON.stringify({ rows }),
  });
  return handleApiResponse<EvalAnalyticsResponse>(response);
}

// ============================================================================
// Evaluator Version API Functions
// ============================================================================

/**
 * Get version history of the evaluator/grader for a dataset
 * Returns all versions with configs and diffs between consecutive versions
 * @param workflowId - The backend dataset ID
 */
export async function getEvaluatorVersions(
  workflowId: string,
): Promise<EvaluatorVersionResponse[]> {
  const response = await apiClient(
    `/finetune/workflows/${workflowId}/evaluator/versions`,
    { method: "GET" },
  );
  return handleApiResponse<EvaluatorVersionResponse[]>(response);
}

// ============================================================================
// Finetune Training Metrics API Functions
// ============================================================================

/**
 * Get training metrics time series for a finetune job
 * Returns raw GRPO/GSPO metrics (reward, KL, loss, grad_norm, completion stats)
 * @param workflowId - The workflow ID (same as dataset ID)
 * @param jobId - The finetune job ID
 */
export async function getFinetuneJobMetrics(
  workflowId: string,
  jobId: string,
): Promise<FinetuneJobMetricsResponse> {
  const response = await apiClient(
    `/finetune/workflows/${workflowId}/jobs/${jobId}/metrics`,
    { method: "GET" },
  );
  return handleApiResponse<FinetuneJobMetricsResponse>(response);
}
