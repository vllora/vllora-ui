// Backend port - can be configured via environment variable
const backendPort = import.meta.env.VITE_BACKEND_PORT || 8080;

// Get the current backend URL (exported for use in other services)
export function getBackendUrl(): string {
  return import.meta.env.VITE_BACKEND_URL || `http://localhost:${backendPort}`;
}

export const API_CONFIG = {
  url: import.meta.env.VITE_LANGDB_API_URL || getBackendUrl(),
  apiKey: import.meta.env.VITE_LANGDB_API_KEY,
  projectId: import.meta.env.VITE_LANGDB_PROJECT_ID,
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

export const getEventsUrl = () => {
  return `${getBackendUrl()}/events`;
}
