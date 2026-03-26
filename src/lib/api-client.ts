import { getBackendUrl } from '@/config/api';
import { tryParseJson } from '@/utils/modelUtils';

/** Gateway returns timestamps without timezone (e.g. "2026-03-18 09:55:18").
 *  These are UTC — append 'Z' so Date parses them correctly. */
export function parseUtcTimestamp(ts: string): number {
  const normalized = ts.endsWith('Z') || ts.includes('+') ? ts : `${ts}Z`;
  return new Date(normalized).getTime();
}

/**
 * Type for the token provider function
 * Returns a token string or null if no authentication is needed
 */
type TokenProvider = () => Promise<string | null>;

/**
 * Global token provider - can be set by the parent application (cloud-ui)
 * Defaults to null for standalone vllora-ui usage
 */
let globalTokenProvider: TokenProvider | null = null;

/**
 * Set the global token provider
 * This should be called once during app initialization in cloud-ui
 */
export function setTokenProvider(provider: TokenProvider | null) {
  globalTokenProvider = provider;
}

export function getTokenProvider() {
  return globalTokenProvider;
}

/**
 * Get the current authentication token
 * Returns null if no token provider is configured or token fetch fails
 */
export async function getAuthToken(): Promise<string | null> {
  if (!globalTokenProvider) {
    return null;
  }

  try {
    return await globalTokenProvider();
  } catch (error) {
    console.error('Failed to get authentication token:', error);
    return null;
  }
}

/**
 * Simple API client for making HTTP requests
 * Automatically attaches bearer token if a token provider is configured
 */
export async function apiClient(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const apiUrl = getBackendUrl();
  const url = `${apiUrl}${endpoint}`;

  // Build headers object
  const headers: Record<string, string> = {};

  // Add authentication token if provider is configured
  if (globalTokenProvider) {
    try {
      const token = await globalTokenProvider();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Failed to get authentication token:', error);
      // Continue without token - let the backend handle unauthorized requests
    }
  }

  // Merge with any custom headers from options
  if (options.headers) {
    const customHeaders = options.headers as Record<string, string>;
    Object.assign(headers, customHeaders);
  }

  // Default to JSON only when caller did not provide Content-Type and body is not multipart.
  // Browser must set multipart boundaries for FormData requests.
  const hasContentTypeHeader = Object.keys(headers).some(
    (k) => k.toLowerCase() === 'content-type'
  );
  if (!hasContentTypeHeader && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // Make the request
  const response = await fetch(url, {
    ...options,
    headers,
  });
  return response;
}

// ─── GET request deduplication ─────────────────────────────────────────────────
// Two layers:
// 1. In-flight dedup: if the same GET is already in progress, share the result
// 2. Short TTL cache (500ms): handles React.StrictMode sequential double-mount
//    where mount→unmount→remount fires the same fetch twice in quick succession.
// Not a persistent cache — entries expire after 500ms so data stays fresh.

const DEDUP_TTL_MS = 500;

interface BufferedResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: [string, string][];
  readonly body: ArrayBuffer;
}

interface CachedEntry {
  readonly response: BufferedResponse;
  readonly expiresAt: number;
}

const inflightGets = new Map<string, Promise<BufferedResponse>>();
const recentGets = new Map<string, CachedEntry>();

function toResponse(buf: BufferedResponse): Response {
  return new Response(buf.body, {
    status: buf.status,
    statusText: buf.statusText,
    headers: buf.headers,
  });
}

async function deduplicatedGet(endpoint: string, options?: RequestInit): Promise<Response> {
  // Layer 1: return from in-flight request
  const inflight = inflightGets.get(endpoint);
  if (inflight) {
    return toResponse(await inflight);
  }

  // Layer 2: return from short TTL cache (covers StrictMode sequential remount)
  const cached = recentGets.get(endpoint);
  if (cached && cached.expiresAt > Date.now()) {
    return toResponse(cached.response);
  }

  const promise = apiClient(endpoint, { ...options, method: 'GET' }).then(
    async (response) => {
      const buf: BufferedResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers.entries()],
        body: await response.arrayBuffer(),
      };
      return buf;
    },
  );

  inflightGets.set(endpoint, promise);

  try {
    const buf = await promise;
    // Cache successful responses briefly
    if (buf.status >= 200 && buf.status < 400) {
      recentGets.set(endpoint, { response: buf, expiresAt: Date.now() + DEDUP_TTL_MS });
      setTimeout(() => recentGets.delete(endpoint), DEDUP_TTL_MS);
    }
    return toResponse(buf);
  } finally {
    inflightGets.delete(endpoint);
  }
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  async get(endpoint: string, options?: RequestInit) {
    return deduplicatedGet(endpoint, options);
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
    const errorJson = tryParseJson(error)
    throw new Error(errorJson?.error || errorJson?.message || error || `API request failed with status ${response.status}`);
  }

  // Handle empty responses (e.g., 204 No Content or empty body)
  const contentLength = response.headers.get('content-length');
  if (response.status === 204 || contentLength === '0') {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text);
}
