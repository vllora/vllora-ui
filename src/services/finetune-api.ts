import { apiClient, handleApiResponse, getAuthToken } from "@/lib/api-client";
import { getBackendUrl } from "@/config/api";
import { DatasetWithRecords, DatasetRecord, DataInfo, EvaluationConfig, BackendEvaluator } from "@/types/dataset-types";

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

/**
 * Convert FE EvaluationConfig to backend Evaluator format
 */
export function evaluationConfigToBackendEvaluator(config: EvaluationConfig): BackendEvaluator {
  if (config.type === 'llm_as_judge') {
    return {
      type: 'llm_as_judge',
      config: {
        prompt_template: config.promptTemplate,
        output_schema: config.outputSchema,
        completion_params: {
          model_name: config.completionParams.model,
          temperature: config.completionParams.temperature,
          max_tokens: config.completionParams.maxTokens,
        },
      },
    };
  } else {
    return {
      type: 'js',
      config: {
        script: config.script,
        completion_params: {
          model_name: config.completionParams.model,
          temperature: config.completionParams.temperature,
          max_tokens: config.completionParams.maxTokens,
        },
      },
    };
  }
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Upload a dataset file (JSONL format) to the provider
 * @param jsonlContent - JSONL content for training
 * @param topicHierarchy - Optional topic hierarchy JSON string
 * @param evaluator - Optional evaluator config JSON string
 */
export async function uploadDataset(
  jsonlContent: string,
  topicHierarchy?: string,
  evaluator?: string
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

  // Add evaluator if provided
  if (evaluator) {
    formData.append('evaluator', evaluator);
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

  // Extract evaluator config if available
  const evaluator = dataset.evaluationConfig
    ? JSON.stringify(evaluationConfigToBackendEvaluator(dataset.evaluationConfig))
    : undefined;

  // Upload dataset with topic hierarchy and evaluator
  const uploadResult = await uploadDataset(jsonlContent, topicHierarchy, evaluator);

  return {
    backendDatasetId: uploadResult.dataset_id,
    jsonlContent,
  };
}

/**
 * Create a finetune job using an already-uploaded dataset
 * This is step 2 of the finetune process - call after uploadDatasetForFinetune
 */
export async function createFinetuneJobFromUpload(
  backendDatasetId: string,
  datasetName: string,
  options?: {
    baseModel?: string;
    outputModel?: string;
    displayName?: string;
  }
): Promise<ReinforcementJob> {
  // Generate output model name from dataset name
  const timestamp = Date.now();
  const safeName = datasetName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const defaultOutputModel = `${safeName}-${timestamp}`;

  // Create reinforcement job with default config
  const job = await createReinforcementJob({
    dataset: backendDatasetId,
    base_model: options?.baseModel || 'llama-v3-8b-instruct',
    output_model: options?.outputModel || defaultOutputModel,
    display_name: options?.displayName || `${datasetName} Fine-tune`,
    training_config: {
      learning_rate: 0.0001,
      lora_rank: 16,
      epochs: 2.0,
      batch_size: 65536,
    },
    inference_parameters: {
      max_output_tokens: 2048,
      temperature: 0.7,
      top_p: 0.9,
    },
  });

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
