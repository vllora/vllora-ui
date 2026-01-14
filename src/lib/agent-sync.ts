// ============================================================================
// Types
// ============================================================================

export interface LucyConfig {
  distri_url?: string;
  // NOTE: backend may return additional provider-specific fields
  model_settings?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    [key: string]: any;
  };
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch Lucy config from the backend API
 */
export async function fetchLucyConfig(): Promise<LucyConfig> {
  const { api, handleApiResponse } = await import('@/lib/api-client');
  const response = await api.get('/agents/config');
  return handleApiResponse<LucyConfig>(response);
}

/**
 * Check if Distri server is available
 * @param url URL to check
 */
export async function checkDistriHealth(url: string): Promise<boolean> {
  const distriUrl = url;
  try {
    // Health endpoint is at root level
    const response = await fetch(`${distriUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get the main agent name to use for chat
 */
export function getMainAgentName(): string {
  return 'vllora_orchestrator';
}
