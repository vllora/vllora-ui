import { getBackendUrl } from '@/config/api';

/**
 * Simple API client for making HTTP requests
 */
export async function apiClient(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const apiUrl = getBackendUrl();
  const url = `${apiUrl}${endpoint}`;

  // Build headers object
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Merge with any custom headers from options
  if (options.headers) {
    const customHeaders = options.headers as Record<string, string>;
    Object.assign(headers, customHeaders);
  }

  // Make the request
  const response = await fetch(url, {
    ...options,
    headers,
  });

  return response;
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  async get(endpoint: string, options?: RequestInit) {
    return apiClient(endpoint, { ...options, method: 'GET' });
  },

  async post(endpoint: string, data?: any, options?: RequestInit) {
    return apiClient(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  async put(endpoint: string, data?: any, options?: RequestInit) {
    return apiClient(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  async patch(endpoint: string, data?: any, options?: RequestInit) {
    return apiClient(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  async delete(endpoint: string, options?: RequestInit) {
    return apiClient(endpoint, { ...options, method: 'DELETE' });
  },
};

/**
 * Helper to parse JSON response and handle errors
 */
export async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `API request failed with status ${response.status}`);
  }

  return response.json();
}
