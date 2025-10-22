import { useRequest } from 'ahooks';
import { getBackendUrl } from '@/config/api';

export interface MCPServer {
  [serverName: string]: {
    url: string;
    headers?: Record<string, string>;
  };
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

// MCP Server Configuration
export interface McpServerConfig {
  definition: {
    filter?: Array<{ name: string; description?: string | null }> | null;
    type: string;
    server_url: string;
    headers: Record<string, string>;
    env: Record<string, string> | null;
  };
  selectedTools: string[];
}

export interface MCPConfig {
  id: string;
  company_slug: string;
  config: {
    mcpServers: MCPServer;
  };
  tools: Record<string, MCPTool[]>; // Tools are organized by server name
  tools_refreshed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MCPConfigsResponse {
  configs: MCPConfig[];
}

export async function listMCPConfigs(): Promise<MCPConfigsResponse> {
  const url = `${getBackendUrl()}/mcp-configs`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch MCP configs: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching MCP configs:', error);
    throw error;
  }
}

export async function fetchMCPTools(configId: string): Promise<Record<string, MCPTool[]>> {
  const url = `${getBackendUrl()}/mcp-configs/${configId}/tools`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch MCP tools: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Raw tools API response:', data);
    
    // The response structure is { "serverName": [tool1, tool2, ...] }
    // Return as-is, grouped by server
    return data;
  } catch (error) {
    console.error('Error fetching MCP tools:', error);
    throw error;
  }
}

export function useMCPConfigs() {
  return useRequest(listMCPConfigs);
}
