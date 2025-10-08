import { invoke } from '@tauri-apps/api/core';

// Dynamic backend port (will be set on app initialization)
let backendPort = 8080; // Default fallback

// Function to get backend port from Tauri with retry logic
export async function initializeBackendPort(): Promise<void> {
  try {
    // Check if running in Tauri environment
    if ((window as any).__TAURI__) {
      // Retry logic in case Tauri commands aren't ready yet
      const maxRetries = 10;
      for (let i = 0; i < maxRetries; i++) {
        try {
          backendPort = await invoke<number>('get_backend_port');
          console.log(`Using backend port: ${backendPort}`);
          return;
        } catch (error) {
          if (i === maxRetries - 1) {
            throw error;
          }
          // Wait 100ms before retrying
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
  } catch (error) {
    console.warn('Failed to get backend port from Tauri after retries, using default 8080:', error);
  }
}

// Get the current backend URL (exported for use in other services)
export function getBackendUrl(): string {
  return `http://localhost:${backendPort}`;
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