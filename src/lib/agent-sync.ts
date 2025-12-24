/**
 * Agent Sync Utility
 *
 * Handles self-healing agent registration:
 * 1. Checks if agents exist on Distri server
 * 2. Re-registers any missing agents from public/agents/
 *
 * This runs on app initialization and provides graceful degradation
 * if the Distri server is temporarily unavailable.
 */

// Base URL for Distri server (without /api/v1 prefix)
const DISTRI_URL = import.meta.env.VITE_DISTRI_URL || 'http://localhost:8081';

// API URL with /api/v1 prefix for agent operations
const DISTRI_API_URL = `${DISTRI_URL}/api/v1`;

const AGENT_NAMES = [
  'vllora_debug',
  // 'vllora_ui_agent',
  // 'vllora_data_agent',
] as const;

type AgentName = (typeof AGENT_NAMES)[number];

/**
 * Result of fetching registered agents
 */
interface FetchAgentsResult {
  agents: string[];
  serverReachable: boolean;
}

/**
 * Fetch list of registered agents from Distri server
 */
async function fetchRegisteredAgents(): Promise<FetchAgentsResult> {
  try {
    const response = await fetch(`${DISTRI_API_URL}/agents`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    // 404 means no agents registered yet - server is still reachable
    if (response.status === 404) {
      return { agents: [], serverReachable: true };
    }

    if (!response.ok) {
      return { agents: [], serverReachable: false };
    }

    const data = await response.json();
    // Handle both array format and object with agents property
    const agents = Array.isArray(data) ? data : (data.agents || []);
    return { agents, serverReachable: true };
  } catch {
    return { agents: [], serverReachable: false };
  }
}

/**
 * Fetch agent definition from public/agents/
 */
async function fetchAgentDefinition(agentName: AgentName): Promise<string | null> {
  try {
    // Map agent name to file name (e.g., vllora_main_agent -> vllora-main-agent.md)
    const fileName = agentName.replace(/_/g, '-') + '.md';
    const response = await fetch(`/agents/${fileName}`);

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Register an agent with the Distri server
 */
async function registerAgent(_agentName: AgentName, definition: string): Promise<boolean> {
  try {
    const response = await fetch(`${DISTRI_API_URL}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/markdown' },
      body: definition,
    });

    if (!response.ok) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure all agents are registered with the Distri server
 * Returns true if all agents are available, false otherwise
 */
export async function ensureAgentsRegistered(): Promise<boolean> {
  const { agents: registeredAgents, serverReachable } = await fetchRegisteredAgents();

  if (!serverReachable) {
    return false;
  }

  // Find missing agents
  const missingAgents = AGENT_NAMES.filter(
    (name) => !registeredAgents.includes(name)
  );

  if (missingAgents.length === 0) {
    return true;
  }

  // Register missing agents
  let allRegistered = true;
  for (const agentName of missingAgents) {
    const definition = await fetchAgentDefinition(agentName);
    if (definition) {
      const success = await registerAgent(agentName, definition);
      if (!success) {
        allRegistered = false;
      }
    } else {
      allRegistered = false;
    }
  }

  return allRegistered;
}

/**
 * Check if Distri server is available
 */
export async function checkDistriHealth(): Promise<boolean> {
  try {
    // Health endpoint is at root level, not under /api/v1
    const response = await fetch(`${DISTRI_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get the Distri server URL
 */
export function getDistriUrl(): string {
  return DISTRI_URL;
}

/**
 * Get the main agent name to use for chat
 */
export function getMainAgentName(): string {
  return 'vllora_debug';
}
