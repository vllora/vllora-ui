import { LocalModel } from "@/types/models";
import { api, handleApiResponse } from "@/lib/api-client";

export async function fetchProjectModels(props: {
  projectId?: string;
}): Promise<LocalModel[]> {
  const { projectId } = props;

  console.log('==== fetchProjectModels', projectId)

  const response = await api.get(`/v1/pricing?include_parameters=true&include_benchmark=true`, projectId ? {
    headers: {
      'x-project-id': projectId
    }
  }: undefined);
  const data = await handleApiResponse<LocalModel[]>(response);
  return data;
}
