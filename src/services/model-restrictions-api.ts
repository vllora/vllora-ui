import { getBackendUrl } from '@/config/api';

export interface ModelRestriction {
  id: string;
  project_id: string;
  tag_type: string;
  tag: string;
  allowed_models: string[];
  disallowed_models: string[];
  created_at: string;
  updated_at: string;
}

export interface ModelRestrictionsResponse {
  restrictions: ModelRestriction[];
}

/**
 * Get model restrictions for a specific project
 */
export async function getModelRestrictions(projectId: string): Promise<ModelRestrictionsResponse> {
  const url = `${getBackendUrl()}/projects/${projectId}/model_restrictions`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get model restrictions: ${response.status} ${response.statusText}`);
    }

    const data: ModelRestrictionsResponse = await response.json();
    return data;
  } catch (error) {
    console.error(`Error getting model restrictions for project ${projectId}:`, error);
    throw error;
  }
}

/**
 * Update model restrictions for a specific project
 */
export async function updateModelRestrictions(
  projectId: string,
  allowedModels: string[]
): Promise<ModelRestriction> {
  const url = `${getBackendUrl()}/projects/${projectId}/model_restrictions`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        control_entity: 'project',
        id: projectId,
        allowed_models: allowedModels,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update model restrictions: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.restriction;
  } catch (error) {
    console.error(`Error updating model restrictions for project ${projectId}:`, error);
    throw error;
  }
}


