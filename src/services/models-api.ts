import { LocalModelsResponse } from '@/types/models';
import { getBackendUrl } from '@/config/api';



export async function fetchLocalModels(): Promise<LocalModelsResponse> {
  const url = `${getBackendUrl()}/v1/models`;

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
}