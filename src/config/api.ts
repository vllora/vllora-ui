// Backend configuration fetched from /api/env
interface EnvConfig {
  VITE_BACKEND_PORT: number;
}

let cachedEnvConfig: EnvConfig | null = null;

// Fetch environment configuration from backend
async function fetchEnvConfig(): Promise<EnvConfig> {
  if (cachedEnvConfig) {
    return cachedEnvConfig;
  }

  try {
    const response = await fetch('/api/env');
    if (!response.ok) {
      throw new Error(`Failed to fetch env config: ${response.statusText}`);
    }
    cachedEnvConfig = await response.json();
    return cachedEnvConfig!;
  } catch (error) {
    console.error('Error fetching env config, using defaults:', error);
    // Fallback to default or env variable
    cachedEnvConfig = {
      VITE_BACKEND_PORT: Number(import.meta.env.VITE_BACKEND_PORT) || 8080,
    };
    return cachedEnvConfig;
  }
}

// Get the backend port (synchronous, uses fallback if not yet fetched)
function getBackendPort(): number {
  return cachedEnvConfig?.VITE_BACKEND_PORT || Number(import.meta.env.VITE_BACKEND_PORT) || 8080;
}

// Get the current backend URL (exported for use in other services)
export function getBackendUrl(): string {
  const backendPort = getBackendPort();
  return import.meta.env.VITE_BACKEND_URL || `http://localhost:${backendPort}`;
}

export function getGrpcBackendUrl(): string {
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
 
  return `http://localhost:4317`;
}

// Initialize config on app startup
export async function initApiConfig(): Promise<void> {
  await fetchEnvConfig();
}

export const API_CONFIG = {
  connectLocal: import.meta.env.VITE_CONNECT_LOCAL === 'true',
} as const;

export function getChatCompletionsUrl(): string {
  return `${getBackendUrl()}/v1/chat/completions`;
}

export const getThreadsUrl = () => {
  return `${getBackendUrl()}/threads`;
}

export const getMessagesUrl = (threadId: string) => {
  return `${getThreadsUrl()}/${threadId}/messages`;
}


export const getRunsUrl = () => {
  return `${getBackendUrl()}/runs`;
}

export const getSpansUrl = () => {
  return `${getBackendUrl()}/spans`;
}

export const getEventsUrl = () => {
  return `${getBackendUrl()}/events`;
}
