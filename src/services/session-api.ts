import { getBackendUrl } from '@/config/api';

export interface SessionResponse {
  session_id: string;
}

export interface CredentialsResponse {
  api_key: string;
}

/**
 * Start a new session for authentication
 */
export async function startSession(): Promise<SessionResponse> {
  const url = `${getBackendUrl()}/session/start`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to start session: ${response.status} ${response.statusText}`);
    }

    const data: SessionResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error starting session:', error);
    throw error;
  }
}

/**
 * Fetch API key for a session
 * Returns the credentials if available, throws error if not ready (404) or other errors
 */
export async function fetchSessionKey(sessionId: string): Promise<CredentialsResponse | null> {
  const url = `${getBackendUrl()}/session/fetch_key/${sessionId}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      // Key not ready yet
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch session key: ${response.status} ${response.statusText}`);
    }

    const data: CredentialsResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching session key:', error);
    throw error;
  }
}

