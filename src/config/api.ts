export const API_CONFIG = {
  url: import.meta.env.VITE_LANGDB_API_URL || 'http://localhost:8080',
  apiKey: import.meta.env.VITE_LANGDB_API_KEY,
  projectId: import.meta.env.VITE_LANGDB_PROJECT_ID,
  connectLocal: import.meta.env.VITE_CONNECT_LOCAL === 'true',
  localApiUrl: 'http://localhost:8080',
} as const;

export function getChatCompletionsUrl(): string {
  if (API_CONFIG.connectLocal) {
    return `${API_CONFIG.localApiUrl}/v1/chat/completions`;
  }
  return `${API_CONFIG.url}/chat/completions`;
}