import { getMessagesUrl, getThreadsUrl } from "@/config/api";
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


export async function getMessageById(props: {
  messageId: string;
  projectId: string;
  threadId: string;
}) {
  const url = `${getThreadsUrl()}/${props.threadId}/messages/${props.messageId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-project-id': props.projectId
    }
  });

  if (!response.ok) {
    let errorMessage = `Failed to fetch message: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.message || errorData.error || errorData.detail) {
        errorMessage = errorData.message || errorData.error || errorData.detail;
      }
    } catch (e) {
      // If parsing error response fails, use default message
    }
    throw new Error(errorMessage);
  }

  return await response.json();
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
      'x-project-id': projectId
    }
  });

  if (!response.ok) {
    let errorMessage = `Failed to fetch messages: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.message || errorData.error || errorData.detail) {
        errorMessage = errorData.message || errorData.error || errorData.detail;
      }
    } catch (e) {
      // If parsing error response fails, use default message
    }
    throw new Error(errorMessage);
  }

  return await response.json();
}
