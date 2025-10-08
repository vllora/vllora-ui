import { ModelPricing, LocalModelsResponse } from '@/types/models';
import { API_CONFIG, getBackendUrl } from '@/config/api';

export async function fetchModels(): Promise<ModelPricing[]> {
  if (!API_CONFIG.url || !API_CONFIG.projectId) {
    throw new Error('Missing required environment variables: VITE_LANGDB_API_URL or VITE_LANGDB_PROJECT_ID');
  }

  const url = `${API_CONFIG.url}/projects/${API_CONFIG.projectId}/models?include_parameters=false&include_benchmark=true`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(API_CONFIG.apiKey && { 'Authorization': `Bearer ${API_CONFIG.apiKey}` }),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching models:', error);
    throw error;
  }
}

export async function fetchLocalModels(): Promise<LocalModelsResponse> {
  const url = `${getBackendUrl()}/v1/models`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch local models: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching local models:', error);
    throw error;
  }
}

export function getApiConfig() {
  return {
    apiUrl: API_CONFIG.url,
    projectId: API_CONFIG.projectId,
    hasApiKey: !!API_CONFIG.apiKey,
    localApiUrl: getBackendUrl(),
  };
}