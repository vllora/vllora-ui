import { api, handleApiResponse } from "@/lib/api-client";

export interface VirtualModel {
  id: string;
  name: string;
  target_configuration: Record<string, any>;
  is_public: boolean;
  variables?: any;
  latest?: boolean;
  is_published?: boolean;
  created_at: string;
  updated_at: string;
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

  await handleApiResponse<void>(response);
}
