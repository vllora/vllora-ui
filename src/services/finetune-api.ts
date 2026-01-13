import { api, handleApiResponse } from "@/lib/api-client";
import { DatasetWithRecords } from "@/types/dataset-types";

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

// ============================================================================
// API Functions
// ============================================================================

/**
 * Create a new finetuning job from a dataset
 */
export async function createFinetuningJob(
  request: CreateFinetuningJobRequest
): Promise<FinetuningJob> {
  const response = await api.post("/finetune/jobs", request);
  return handleApiResponse<FinetuningJob>(response);
}
