import { useRequest } from 'ahooks';
import { getBackendUrl } from '@/config/api';
import { api, handleApiResponse } from '@/lib/api-client';

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
  const response = await api.get('/mcp-configs');
  return handleApiResponse<MCPConfigsResponse>(response);
}

export async function fetchMCPTools(configId: string): Promise<Record<string, MCPTool[]>> {
  const response = await api.get(`/mcp-configs/${configId}/tools`);
  const data = await handleApiResponse<Record<string, MCPTool[]>>(response);
  console.log('Raw tools API response:', data);

  // The response structure is { "serverName": [tool1, tool2, ...] }
  // Return as-is, grouped by server
  return data;
}

export function useMCPConfigs() {
  return useRequest(listMCPConfigs);
}
