import { ModelInfo } from "@/types/models";
import { api, handleApiResponse } from "@/lib/api-client";

export async function fetchProjectModels(props: {
  projectId?: string;
}): Promise<ModelInfo[]> {
  const { projectId } = props;
  const response = await api.get(`/v1/pricing?include_parameters=true&include_benchmark=true`, projectId ? {
    headers: {
      'x-project-id': projectId
    }
  }: undefined);
  const data = await handleApiResponse<ModelInfo[]>(response);
  return data;
}
