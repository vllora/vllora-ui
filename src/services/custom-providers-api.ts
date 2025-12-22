import { apiClient, handleApiResponse } from '@/lib/api-client';

// ============================================================================
// Types for Custom Provider Definitions
// ============================================================================

export type CustomInferenceApiType =
  | 'openai'
  | 'anthropic'
  | 'bedrock'
  | 'gemini';

export const API_TYPES: { value: CustomInferenceApiType; label: string }[] = [
  { value: 'openai', label: 'OpenAI-compatible' },
  { value: 'anthropic', label: 'Anthropic' },
];

export interface CustomProviderDefinition {
  id: string;
  provider_name: string;
  description?: string;
  endpoint?: string;
  priority: number;
  privacy_policy_url?: string;
  terms_of_service_url?: string;
  custom_inference_api_type?: CustomInferenceApiType;
  has_credentials: boolean;
  is_custom: boolean;
}

export interface CreateCustomProviderRequest {
  provider_name: string;
  description?: string;
  endpoint?: string;
  custom_inference_api_type?: CustomInferenceApiType;
  priority?: number;
  privacy_policy_url?: string;
  terms_of_service_url?: string;
}

export interface UpdateCustomProviderRequest {
  description?: string;
  endpoint?: string;
  custom_inference_api_type?: CustomInferenceApiType;
  priority?: number;
  privacy_policy_url?: string;
  terms_of_service_url?: string;
}

export interface CustomProviderResponse {
  provider: CustomProviderDefinition;
}

// ============================================================================
// Types for Custom Models
// ============================================================================

export type ModelType = 'completions' | 'embeddings' | 'image_generation';

export type ModelCapability = 'tools' | 'reasoning';

export type ModelIOFormat = 'Text' | 'Image' | 'Video' | 'Audio';

export interface CustomModelDefinition {
  id: string;
  model_name: string;
  provider_name: string;
  description?: string;
  model_type?: ModelType;
  input_token_price?: number;
  output_token_price?: number;
  context_size?: number;
  capabilities?: ModelCapability[];
  input_types?: ModelIOFormat[];
  output_types?: ModelIOFormat[];
  endpoint?: string;
  model_name_in_provider?: string;
  is_custom: boolean;
}

export interface CreateCustomModelRequest {
  model_name: string;
  provider_name: string;
  model_type: ModelType; // Required by backend
  description?: string;
  input_token_price?: number;
  output_token_price?: number;
  context_size?: number;
  capabilities?: ModelCapability[];
  input_types?: ModelIOFormat[];
  output_types?: ModelIOFormat[];
  endpoint?: string;
  model_name_in_provider?: string;
}

export interface UpdateCustomModelRequest {
  model_name?: string;
  description?: string;
  model_type?: ModelType;
  input_token_price?: number;
  output_token_price?: number;
  context_size?: number;
  capabilities?: ModelCapability[];
  input_types?: ModelIOFormat[];
  output_types?: ModelIOFormat[];
  endpoint?: string;
  model_name_in_provider?: string;
}

// ============================================================================
// Custom Provider API Functions
// ============================================================================

/**
 * Create a new custom provider definition
 */
export async function createCustomProvider(
  request: CreateCustomProviderRequest,
  projectId?: string
): Promise<CustomProviderDefinition> {
  const response = await apiClient('/providers', {
    method: 'POST',
    body: JSON.stringify(request),
    ...(projectId && {
      headers: {
        'x-project-id': projectId,
      },
    }),
  });
  const data = await handleApiResponse<CustomProviderResponse>(response);
  return data.provider;
}

/**
 * Update a custom provider definition
 */
export async function updateCustomProviderDefinition(
  providerId: string,
  request: UpdateCustomProviderRequest,
  projectId?: string
): Promise<CustomProviderDefinition> {
  const response = await apiClient(`/providers/definitions/${providerId}`, {
    method: 'PUT',
    body: JSON.stringify(request),
    ...(projectId && {
      headers: {
        'x-project-id': projectId,
      },
    }),
  });
  const data = await handleApiResponse<CustomProviderResponse>(response);
  return data.provider;
}

/**
 * Delete a custom provider definition by ID
 */
export async function deleteCustomProviderDefinition(
  providerId: string,
  projectId?: string
): Promise<void> {
  const response = await apiClient(`/providers/definitions/${providerId}`, {
    method: 'DELETE',
    ...(projectId && {
      headers: {
        'x-project-id': projectId,
      },
    }),
  });
  await handleApiResponse<void>(response);
}

/**
 * Delete a custom provider by name
 */
export async function deleteCustomProvider(
  providerName: string,
  projectId?: string
): Promise<void> {
  const response = await apiClient(`/providers/${encodeURIComponent(providerName)}`, {
    method: 'DELETE',
    ...(projectId && {
      headers: {
        'x-project-id': projectId,
      },
    }),
  });
  await handleApiResponse<void>(response);
}

// ============================================================================
// Custom Model API Functions
// ============================================================================

/**
 * Create a new custom model
 */
export async function createCustomModel(
  request: CreateCustomModelRequest,
  projectId?: string
): Promise<void> {
  const response = await apiClient('/models', {
    method: 'POST',
    body: JSON.stringify(request),
    ...(projectId && {
      headers: {
        'x-project-id': projectId,
      },
    }),
  });
  await handleApiResponse<{ message: string }>(response);
}

/**
 * Update a custom model
 */
export async function updateCustomModel(
  modelId: string,
  request: UpdateCustomModelRequest,
  projectId?: string
): Promise<void> {
  const response = await apiClient(`/models/${modelId}`, {
    method: 'PUT',
    body: JSON.stringify(request),
    ...(projectId && {
      headers: {
        'x-project-id': projectId,
      },
    }),
  });
  await handleApiResponse<{ message: string }>(response);
}

/**
 * Delete a custom model by name
 */
export async function deleteCustomModel(
  modelName: string,
  projectId?: string
): Promise<void> {
  const response = await apiClient(`/models/custom/${encodeURIComponent(modelName)}`, {
    method: 'DELETE',
    ...(projectId && {
      headers: {
        'x-project-id': projectId,
      },
    }),
  });
  await handleApiResponse<void>(response);
}

/**
 * Get custom models for a specific provider
 */
export async function getCustomModelsByProvider(
  providerName: string,
  projectId?: string
): Promise<CustomModelDefinition[]> {
  const response = await apiClient(`/models?provider=${encodeURIComponent(providerName)}`, {
    method: 'GET',
    ...(projectId && {
      headers: {
        'x-project-id': projectId,
      },
    }),
  });
  return handleApiResponse<CustomModelDefinition[]>(response);
}

// ============================================================================
// Provider Credentials API Functions (for custom providers)
// ============================================================================

export interface SetProviderCredentialsRequest {
  api_key?: string;
}

/**
 * Set credentials for a custom provider
 */
export async function setCustomProviderCredentials(
  providerName: string,
  request: SetProviderCredentialsRequest,
  projectId?: string
): Promise<void> {
  const response = await apiClient(`/providers/${providerName}`, {
    method: 'PUT',
    body: JSON.stringify({
      provider_type: 'api_key',
      credentials: request,
    }),
    ...(projectId && {
      headers: {
        'x-project-id': projectId,
      },
    }),
  });
  await handleApiResponse<void>(response);
}
