export const LOCAL_API_URL = 'http://0.0.0.0:8080';

export const API_CONFIG = {
  url: import.meta.env.VITE_LANGDB_API_URL || LOCAL_API_URL,
  apiKey: import.meta.env.VITE_LANGDB_API_KEY,
  projectId: import.meta.env.VITE_LANGDB_PROJECT_ID,
  connectLocal: import.meta.env.VITE_CONNECT_LOCAL === 'true',
  localApiUrl: LOCAL_API_URL,
} as const;

export function getChatCompletionsUrl(): string {
  if (API_CONFIG.connectLocal) {
    return `${API_CONFIG.localApiUrl}/v1/chat/completions`;
  }
  return `${API_CONFIG.url}/chat/completions`;
}

export const getThreadsUrl = () => {
  return `${API_CONFIG.url}/threads`;
}

export const getMessagesUrl = (threadId: string) => {
  return `${getThreadsUrl()}/${threadId}/messages`;
}
  