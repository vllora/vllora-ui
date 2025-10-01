import { API_CONFIG, getMessagesUrl } from "@/config/api";
import { Message } from "@/types/chat";

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

export async function queryMessages(
  projectId: string,
  threadId: string,
  _request: QueryMessagesRequest = {}
): Promise<Message[]> {

  const url = getMessagesUrl(threadId);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-project-id': projectId,
      'authorization': `Bearer ${API_CONFIG.apiKey}`,
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch messages: ${response.statusText}`);
  }

  return await response.json();
}
