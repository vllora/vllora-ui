import { ModelPricing, LocalModelsResponse } from '@/types/models';

const API_URL = import.meta.env.VITE_LANGDB_API_URL;
const PROJECT_ID = import.meta.env.VITE_LANGDB_PROJECT_ID;
const API_KEY = import.meta.env.VITE_LANGDB_API_KEY;
const LOCAL_API_URL = 'http://0.0.0.0:8080';

export async function fetchModels(): Promise<ModelPricing[]> {
  if (!API_URL || !PROJECT_ID) {
    throw new Error('Missing required environment variables: VITE_LANGDB_API_URL or VITE_LANGDB_PROJECT_ID');
  }

  const url = `${API_URL}/projects/${PROJECT_ID}/models?include_parameters=false&include_benchmark=true`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY && { 'Authorization': `Bearer ${API_KEY}` }),
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
  const url = `${LOCAL_API_URL}/v1/models`;

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
    apiUrl: API_URL,
    projectId: PROJECT_ID,
    hasApiKey: !!API_KEY,
    localApiUrl: LOCAL_API_URL,
  };
}