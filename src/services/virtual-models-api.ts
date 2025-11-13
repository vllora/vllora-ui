import { api, handleApiResponse } from "@/lib/api-client";

export interface VirtualModelVariable {
  name: string;
  type: 'string' | 'number' | 'boolean';
  default_value?: any;
  test_value?: any;
  description?: string;
}

export interface VirtualModelVersion {
  id: string;
  model_id: string;
  version: number;
  target_configuration: Record<string, any>;
  created_at: string;
  updated_at: string;
  variables?: VirtualModelVariable[];
  published_at?: string;
  latest: boolean;
}

export interface VirtualModel {
  // Flattened from VirtualModel struct
  id: string;
  name: string;
  slug: string;
  project_id: string;
  disabled_at?: string;
  created_at: string;
  updated_at: string;
  is_public: boolean;
  // From VirtualModelWithVersions
  versions: VirtualModelVersion[];
  is_supported_in_tier: boolean;
}

export interface CreateVirtualModelParams {
  projectId: string;
  name: string;
  target_configuration: Record<string, any>;
  is_public?: boolean;
  latest?: boolean;
}

export async function fetchVirtualModels(props: {
  projectId?: string;
}): Promise<VirtualModel[]> {
  const { projectId } = props;
  if (!projectId) {
    return [];
  }

  const response = await api.get(`/virtual-models`, {
    headers: {
      "x-project-id": projectId,
    },
  });
  const data = await handleApiResponse<VirtualModel[]>(response);
  return data;
}

export async function createVirtualModel(
  params: CreateVirtualModelParams
): Promise<VirtualModel> {
  const { projectId, ...body } = params;

  const response = await api.post(
    `/virtual-models`,
    {
      ...body,
      is_public: body.is_public ?? false,
      latest: body.latest ?? true,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-project-id": projectId,
      },
    }
  );

  const data = await handleApiResponse<VirtualModel>(response);
  return data;
}

export async function deleteVirtualModel(props: {
  projectId: string;
  virtualModelId: string;
}): Promise<void> {
  const { projectId, virtualModelId } = props;

  const response = await api.delete(`/virtual-models/${virtualModelId}`, {
    headers: {
      "x-project-id": projectId,
    },
  });

  // 204 No Content - successful deletion with no response body
  if (response.status === 204) {
    return;
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Failed to delete virtual model: ${response.status}`);
  }
}
