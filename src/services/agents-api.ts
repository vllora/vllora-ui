import { apiClient, handleApiResponse } from '@/lib/api-client';

/**
 * Agent registration status from BE
 */
export interface AgentRegistrationStatus {
  name: string;
  success: boolean;
  error?: string;
}

/**
 * Response from POST /agents/register
 */
export interface RegistrationResult {
  distri_running: boolean;
  distri_endpoint: string;
  agents: AgentRegistrationStatus[];
}

/**
 * Provider configuration for model settings
 * Maps to Distri's [model_settings.provider] section
 */
export interface ProviderConfig {
  /** Provider type: "openai", "openai_compat", or "vllora" */
  name: 'openai' | 'openai_compat' | 'vllora';
  /** Base URL for the API endpoint */
  base_url?: string;
  /** API key for authentication */
  api_key?: string;
  /** Project ID (used by vllora provider) */
  project_id?: string;
}

/**
 * Model settings configuration
 * Maps to Distri's [model_settings] section
 */
export interface ModelSettingsConfig {
  /** Model name (e.g., "gpt-4o", "gpt-4o-mini") */
  model?: string;
  /** Temperature for sampling (0.0 - 2.0) */
  temperature?: number;
  /** Maximum tokens in response */
  max_tokens?: number;
  /** Provider configuration */
  provider?: ProviderConfig;
}

/**
 * Request payload for POST /agents/register
 */
export interface RegisterAgentsRequest {
  distri_url: string;
  /** Optional model settings to override agent defaults */
  model_settings?: ModelSettingsConfig;
}

/**
 * Response from GET /agents/config
 * Contains saved Lucy configuration from lucy.json
 */
export interface LucyConfig {
  distri_url?: string;
  model_settings?: ModelSettingsConfig;
}

/**
 * Register all agents with the Distri server via vLLora BE
 *
 * The BE has embedded agent definitions and will register them
 * with the specified Distri server.
 *
 * @example
 * const result = await registerAgents({ distri_url: 'http://localhost:8081' });
 * if (result.agents.every(a => a.success)) {
 *   console.log('All agents registered successfully');
 * }
 */
export const registerAgents = async (
  request: RegisterAgentsRequest
): Promise<RegistrationResult> => {
  const response = await apiClient('/agents/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  return handleApiResponse<RegistrationResult>(response);
};

/**
 * Get saved Lucy configuration from BE
 *
 * Returns the saved distri_url and model_settings from lucy.json
 */
export const getLucyConfig = async (): Promise<LucyConfig> => {
  const response = await apiClient('/agents/config', {
    method: 'GET',
  });

  return handleApiResponse<LucyConfig>(response);
};
