import { Thread } from '@/types/chat';
import { apiClient, handleApiResponse } from '@/lib/api-client';

export interface QueryThreadsRequest {
  order_by?: [string, string][];
  limit?: number;
  offset?: number;
}


interface ApiThreadsResponse {
  data: Thread[];
  pagination: {
    total: number;
    offset: number;
    limit: number;
  };
}

export interface QueryThreadsResponse {
  data: Thread[];
  pagination: {
    total: number;
    offset: number;
    limit: number;
  };
}

export interface UpdateThreadTitleRequest {
  threadId: string;
  title: string;
  projectId: string;
}

// Backend MessageThread type (returned by GET /threads/{id})
export interface MessageThread {
  id: string;
  project_id: string;
  title?: string | null;
  user_id?: string | null;
  model_name?: string | null;
  is_public: boolean;
  description?: string | null;
  keywords?: string[] | null;
  created_at: string;
  updated_at: string;
}

interface GetThreadByIdResponse {
  thread: MessageThread;
}

/**
 * Query threads with pagination
 */
export async function queryThreads(
  projectId: string,
  request: QueryThreadsRequest
): Promise<QueryThreadsResponse> {
  const response = await apiClient('/threads', {
    method: 'POST',
    headers: {
      'x-project-id': projectId,
    },
    body: JSON.stringify(request),
  });

  const apiData = await handleApiResponse<ApiThreadsResponse>(response);

  // Transform API response to frontend Thread type
  return {
    data: apiData.data,
    pagination: apiData.pagination,
  };
}

/**
 * Get thread by ID
 */
export async function getThreadById(
  projectId: string,
  threadId: string
): Promise<MessageThread> {
  const response = await apiClient(`/threads/${threadId}`, {
    method: 'GET',
    headers: {
      'x-project-id': projectId,
    },
  });

  if (!response.ok && response.status === 404) {
    throw new Error(`Thread not found: ${threadId}`);
  }

  const data = await handleApiResponse<GetThreadByIdResponse>(response);
  return data.thread;
}

/**
 * Update thread title
 */
export async function updateThreadTitle(
  request: UpdateThreadTitleRequest
): Promise<void> {
  const response = await apiClient(`/threads/${request.threadId}`, {
    method: 'PUT',
    headers: {
      'x-project-id': request.projectId,
    },
    body: JSON.stringify({ title: request.title }),
  });

  await handleApiResponse<void>(response);
}

/**
 * Delete a thread
 */
export async function deleteThread(projectId: string, threadId: string): Promise<void> {
  const response = await apiClient(`/threads/${threadId}`, {
    method: 'DELETE',
    headers: {
      'x-project-id': projectId,
    },
  });

  await handleApiResponse<void>(response);
}
