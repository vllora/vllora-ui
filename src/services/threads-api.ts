import { getThreadsUrl } from '@/config/api';
import { Thread } from '@/types/chat';

export interface QueryThreadsRequest {
  order_by?: [string, string][];
  limit?: number;
  offset?: number;
}

// API response type (matches backend ThreadSpan structure)
interface ThreadSpan {
  thread_id: string;
  start_time_us: number;
  finish_time_us: number;
  run_ids: string[];
  input_models: string[];
  cost: number;
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

/**
 * Transform API ThreadSpan to frontend Thread type
 */
function transformThreadSpan(span: ThreadSpan): Thread {
  return {
    thread_id: span.thread_id,
    start_time_us: span.start_time_us,
    finish_time_us: span.finish_time_us,
    run_ids: span.run_ids,
    input_models: span.input_models,
    cost: span.cost
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
  const url = getThreadsUrl();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-project-id': projectId,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to query threads: ${response.status} ${response.statusText}`);
    }

    const apiData: ApiThreadsResponse = await response.json();
    console.log('==== apiData', apiData)

    // Transform API response to frontend Thread type
    return {
      data: apiData.data,
      pagination: apiData.pagination,
    };
  } catch (error) {
    console.error('Error querying threads:', error);
    throw error;
  }
}

/**
 * Get thread by ID
 */
export async function getThreadById(
  projectId: string,
  threadId: string
): Promise<MessageThread> {
  const url = `${getThreadsUrl()}/${threadId}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-project-id': projectId,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Thread not found: ${threadId}`);
      }
      throw new Error(`Failed to get thread: ${response.status} ${response.statusText}`);
    }

    const data: GetThreadByIdResponse = await response.json();
    return data.thread;
  } catch (error) {
    console.error(`Error getting thread ${threadId}:`, error);
    throw error;
  }
}

/**
 * Update thread title
 */
export async function updateThreadTitle(
  request: UpdateThreadTitleRequest
): Promise<void> {
  const url = `${getThreadsUrl()}/${request.threadId}`;

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
  const url = `${getThreadsUrl()}/${threadId}`;

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
