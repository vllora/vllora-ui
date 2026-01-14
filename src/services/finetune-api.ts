import { apiClient, handleApiResponse, getAuthToken } from "@/lib/api-client";
import { getBackendUrl } from "@/config/api";
import { DatasetWithRecords, DatasetRecord, DataInfo } from "@/types/dataset-types";

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
  lora_rank?: number;
  epochs?: number;
  batch_size?: number;
}

export interface ReinforcementInferenceParameters {
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
}

export interface CreateReinforcementJobRequest {
  dataset: string;
  base_model: string;
  output_model?: string;
  display_name?: string;
  training_config?: ReinforcementTrainingConfig;
  inference_parameters?: ReinforcementInferenceParameters;
}

export interface ReinforcementJob {
  id: string;
  provider_job_id?: string;
  status: string;
  base_model: string;
  fine_tuned_model?: string;
  provider?: string;
  hyperparameters?: any;
  suffix?: string;
  error_message?: string;
  training_file_id?: string;
  validation_file_id?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface DatasetUploadResponse {
  dataset_id: string;
  [key: string]: unknown;
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
 */
export async function uploadDataset(jsonlContent: string): Promise<DatasetUploadResponse> {
  const apiUrl = getBackendUrl();
  const formData = new FormData();

  // Create a Blob from the JSONL content
  const blob = new Blob([jsonlContent], { type: 'application/x-ndjson' });
  formData.append('file', blob, 'training.jsonl');

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
 */
export async function listReinforcementJobs(
  limit?: number,
  after?: string
): Promise<ReinforcementJob[]> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (after) params.set('after', after);

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
 * Start a finetune job with default configuration
 * This uploads the dataset and creates a reinforcement job in one step
 */
export async function startFinetuneJob(
  dataset: DatasetWithRecords,
  options?: {
    baseModel?: string;
    outputModel?: string;
    displayName?: string;
  }
): Promise<ReinforcementJob> {
  // Convert dataset to JSONL
  const jsonlContent = datasetToJsonl(dataset.records);

  if (!jsonlContent.trim()) {
    throw new Error('No valid training records found in dataset');
  }

  // Upload dataset
  const uploadResult = await uploadDataset(jsonlContent);

  // Generate output model name from dataset name
  const timestamp = Date.now();
  const safeName = dataset.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const defaultOutputModel = `${safeName}-${timestamp}`;

  // Create reinforcement job with default config
  const job = await createReinforcementJob({
    dataset: uploadResult.dataset_id,
    base_model: options?.baseModel || 'llama-v3-8b-instruct',
    output_model: options?.outputModel || defaultOutputModel,
    display_name: options?.displayName || `${dataset.name} Fine-tune`,
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
