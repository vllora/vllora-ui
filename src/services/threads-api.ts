import { LOCAL_API_URL } from '@/config/api';
import { Thread } from '@/types/chat';

export interface QueryThreadsRequest {
  order_by?: [string, string][];
  limit?: number;
  offset?: number;
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

/**
 * Query threads with pagination
 */
export async function queryThreads(
  projectId: string,
  request: QueryThreadsRequest
): Promise<QueryThreadsResponse> {
  //const url = `${LOCAL_API_URL}/threads`;
  const url = `https://api.staging.langdb.ai/threads`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-project-id': projectId,
        'authorization': 'Bearer langdb_YmZzRGp6NWR5UXFraHA=',
        //'x-project-id': projectId,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to query threads: ${response.status} ${response.statusText}`);
    }

    const data: QueryThreadsResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error querying threads:', error);
    throw error;
  }
}

/**
 * Update thread title
 */
export async function updateThreadTitle(
  request: UpdateThreadTitleRequest
): Promise<void> {
  const url = `${LOCAL_API_URL}/threads/${request.threadId}/title`;

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-project-id': request.projectId,
      },
      body: JSON.stringify({ title: request.title }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update thread title: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Error updating thread title ${request.threadId}:`, error);
    throw error;
  }
}

/**
 * Delete a thread
 */
export async function deleteThread(projectId: string, threadId: string): Promise<void> {
  const url = `${LOCAL_API_URL}/threads/${threadId}`;

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-project-id': projectId,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete thread: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Error deleting thread ${threadId}:`, error);
    throw error;
  }
}
