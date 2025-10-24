import { api, handleApiResponse } from "@/lib/api-client";

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
  const response = await api.post("/session/start");
  return handleApiResponse<SessionResponse>(response);
}

/**
 * Fetch API key for a session
 * Returns the credentials if available, throws error if not ready (404) or other errors
 */
export async function fetchSessionKey(
  sessionId: string
): Promise<CredentialsResponse | null> {
  const response = await api.get(`/session/fetch_key/${sessionId}`);

  if (response.status === 404) {
    // Key not ready yet
    return null;
  }

  return handleApiResponse<CredentialsResponse>(response);
}
