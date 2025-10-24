import { Message } from "@/types/chat";
import { apiClient, handleApiResponse } from '@/lib/api-client';

export interface QueryMessagesRequest {
  order_by?: [string, 'asc' | 'desc'][];
  limit?: number;
  offset?: number;
}

export interface QueryMessagesResponse {
  data: Message[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}


export async function getMessageById(props: {
  messageId: string;
  projectId: string;
  threadId: string;
}) {
  const endpoint = `/threads/${props.threadId}/messages/${props.messageId}`;

  const response = await apiClient(endpoint, {
    method: 'GET',
    headers: {
      'x-project-id': props.projectId
    }
  });

  return handleApiResponse<Message>(response);
}

export async function queryMessages(
  projectId: string,
  threadId: string,
  _request: QueryMessagesRequest = {}
): Promise<Message[]> {

  const endpoint = `/threads/${threadId}/messages`;

  const response = await apiClient(endpoint, {
    method: 'GET',
    headers: {
      'x-project-id': projectId
    }
  });

  return handleApiResponse<Message[]>(response);
}
