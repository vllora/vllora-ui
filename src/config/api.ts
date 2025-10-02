export const LOCAL_API_URL = 'http://0.0.0.0:8080';

export const API_CONFIG = {
  url: import.meta.env.VITE_LANGDB_API_URL || LOCAL_API_URL,
  apiKey: import.meta.env.VITE_LANGDB_API_KEY,
  projectId: import.meta.env.VITE_LANGDB_PROJECT_ID,
  connectLocal: import.meta.env.VITE_CONNECT_LOCAL === 'true',
  localApiUrl: LOCAL_API_URL,
} as const;

export function getChatCompletionsUrl(): string {
  
  return `${LOCAL_API_URL}/v1/chat/completions`;
}

export const getThreadsUrl = () => {
  return `${LOCAL_API_URL}/threads`;
}

export const getMessagesUrl = (threadId: string) => {
  return `${getThreadsUrl()}/${threadId}/messages`;
}
  

export const getRunsUrl = () => {
  return `${LOCAL_API_URL}/runs`;
}
  
export const getEventsUrl = () => {
  return `${LOCAL_API_URL}/events`;
}