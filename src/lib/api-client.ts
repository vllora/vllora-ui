import { fetchAuthSession } from 'aws-amplify/auth';
import { getBackendUrl } from '@/config/api';

/**
 * Navigate to login page
 */
function redirectToLogin() {
  // Only redirect if not already on login page
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

/**
 * API client that automatically adds authentication token to requests
 */
export async function apiClient(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const apiUrl = getBackendUrl();
  const url = `${apiUrl}${endpoint}`;

  try {
    // Get current auth session from Amplify
    const session = await fetchAuthSession();
    const accessToken = session.tokens?.accessToken?.toString();

    // If no access token, redirect to login
    if (!accessToken) {
      console.warn('No access token found, redirecting to login');
      redirectToLogin();
      throw new Error('Authentication required');
    }

    // Build headers object
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authorization header
    headers['Authorization'] = `Bearer ${accessToken}`;

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

    // Check for 401 Unauthorized - token might be expired and refresh failed
    if (response.status === 401) {
      console.warn('Received 401 Unauthorized, redirecting to login');
      redirectToLogin();
      throw new Error('Authentication expired');
    }

    return response;
  } catch (error) {
    // Check if it's an auth-related error
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      if (
        errorMessage.includes('auth') ||
        errorMessage.includes('token') ||
        errorMessage.includes('credential') ||
        errorMessage.includes('sign in') ||
        errorMessage.includes('not authenticated')
      ) {
        console.warn('Authentication error detected, redirecting to login');
        redirectToLogin();
      }
    }
    console.error('API request failed:', error);
    throw error;
  }
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
