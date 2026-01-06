/**
 * Agent Sync Utility
 *
 * Manages Distri server connection:
 * - URL storage (localStorage)
 * - Health checks
 *
 * Note: Agent registration is now handled by vLLora BE via POST /agents/register
 * The BE embeds agents and registers them with Distri server.
 */

// Storage key for custom Distri URL
const DISTRI_URL_KEY = 'vllora:distri-url';
const DEFAULT_DISTRI_URL = 'http://localhost:8081';

/**
 * Get the Distri server URL from localStorage or environment
 */
export function getDistriUrl(): string {
  try {
    const stored = localStorage.getItem(DISTRI_URL_KEY);
    if (stored) return stored;
  } catch {
    // Ignore storage errors
  }
  return import.meta.env.VITE_DISTRI_URL || DEFAULT_DISTRI_URL;
}

/**
 * Save custom Distri URL to localStorage
 */
export function saveDistriUrl(url: string): void {
  try {
    localStorage.setItem(DISTRI_URL_KEY, url);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Reset Distri URL to default (remove from localStorage)
 */
export function resetDistriUrl(): void {
  try {
    localStorage.removeItem(DISTRI_URL_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if Distri server is available
 * @param url Optional URL to check (defaults to current Distri URL)
 */
export async function checkDistriHealth(url?: string): Promise<boolean> {
  const distriUrl = url || getDistriUrl();
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
