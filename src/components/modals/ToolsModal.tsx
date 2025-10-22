import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plug, Search, FileText, Database, Globe, Server, Loader2, AlertCircle } from 'lucide-react';
import { useMCPConfigs, MCPConfig, MCPTool, fetchMCPTools, McpServerConfig } from '@/services/mcp-api';
import { useState, useEffect } from 'react';

interface ToolsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolsUsage?: Map<string, McpServerConfig>;
  setToolsUsage?: (toolsUsage: Map<string, McpServerConfig>) => void;
}

export const ToolsModal: React.FC<ToolsModalProps> = ({ 
  open, 
  onOpenChange,
  toolsUsage,
  setToolsUsage
}) => {
  const { data: mcpData, loading, error, run: refetchMCPData } = useMCPConfigs({
    onError: (err) => {
      console.error('Failed to load MCP configs:', err);
    },
  });

  const [toolsByServer, setToolsByServer] = useState<Record<string, MCPTool[]>>({});
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);

  const fetchTools = async (configId: string) => {
    console.log('fetchTools called with configId:', configId);
    setToolsLoading(true);
    setToolsError(null);
    try {
      const fetchedToolsByServer = await fetchMCPTools(configId);
      console.log('Fetched tools by server:', fetchedToolsByServer);
      setToolsByServer(fetchedToolsByServer);
      
      // Auto-select all tools by default
      if (setToolsUsage && mcpData?.configs?.[0]?.config?.mcpServers) {
        const newToolsUsage = new Map<string, McpServerConfig>();
        // Create one config per server with its tools selected
        for (const serverName in fetchedToolsByServer) {
          const serverConfig = mcpData.configs[0].config.mcpServers[serverName];
          if (serverConfig) {
            const serverTools = fetchedToolsByServer[serverName] || [];
            const toolNames = serverTools.map(tool => tool.name);
            
            newToolsUsage.set(serverName, {
              definition: {
                filter: null,
                type: 'http',
                server_url: serverConfig.url,
                headers: serverConfig.headers || {},
                env: null,
              },
              selectedTools: toolNames, // All tools for this server selected by default
            });
          }
        }
        setToolsUsage(newToolsUsage);
        console.log('Auto-selected all tools:', newToolsUsage);
      }
    } catch (err) {
      setToolsError(err instanceof Error ? err.message : 'Failed to fetch tools');
      console.error('Error fetching tools:', err);
    } finally {
      setToolsLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (mcpData?.configs?.[0]?.id) {
      await fetchTools(mcpData.configs[0].id);
    }
  };

  const handleUseAllTools = () => {
    if (!setToolsUsage || !mcpData?.configs?.[0]?.config?.mcpServers) return;
    
    const newToolsUsage = new Map<string, McpServerConfig>();
    
    // Create one config per server with all its tools selected
    for (const serverName in toolsByServer) {
      const serverConfig = mcpData.configs[0].config.mcpServers[serverName];
      if (serverConfig) {
        const serverTools = toolsByServer[serverName] || [];
        const toolNames = serverTools.map(tool => tool.name);
        
        newToolsUsage.set(serverName, {
          definition: {
            filter: null,
            type: 'http',
            server_url: serverConfig.url,
            headers: serverConfig.headers || {},
            env: null,
          },
          selectedTools: toolNames,
        });
      }
    }
    
    setToolsUsage(newToolsUsage);
    console.log('All tools selected:', newToolsUsage);
  };

  const handleToggleTool = (toolName: string, serverName: string) => {
    if (!setToolsUsage || !mcpData?.configs?.[0]?.config?.mcpServers) return;
    
    const newToolsUsage = new Map(toolsUsage || new Map());
    const serverConfig = mcpData.configs[0].config.mcpServers[serverName];
    const currentConfig = newToolsUsage.get(serverName);
    
    if (currentConfig) {
      // Toggle tool in existing config
      const currentTools = currentConfig.selectedTools;
      const isSelected = currentTools.includes(toolName);
      
      newToolsUsage.set(serverName, {
        ...currentConfig,
        selectedTools: isSelected
          ? currentTools.filter(t => t !== toolName)  // Remove tool
          : [...currentTools, toolName],               // Add tool
      });
    } else if (serverConfig) {
      // Create new config with this tool
      newToolsUsage.set(serverName, {
        definition: {
          filter: null,
          type: 'http',
          server_url: serverConfig.url,
          headers: serverConfig.headers || {},
          env: null,
        },
        selectedTools: [toolName],
      });
    }
    
    setToolsUsage(newToolsUsage);
    console.log('Tool toggled:', toolName, 'in server:', serverName, 'New usage:', newToolsUsage);
  };

  const isToolSelected = (toolName: string, serverName: string): boolean => {
    if (!toolsUsage) return false;
    
    const serverConfig = toolsUsage.get(serverName);
    return serverConfig ? serverConfig.selectedTools.includes(toolName) : false;
  };

  const getSelectedToolsCount = (): number => {
    if (!toolsUsage) return 0;
    const selectedTools = new Set<string>();
    toolsUsage.forEach(config => {
      config.selectedTools.forEach(toolName => selectedTools.add(toolName));
    });
    return selectedTools.size;
  };

  // Helper function to update selectedTools for a server
  const updateToolSelectedTools = (serverName: string, newSelectedTools: string[]) => {
    if (!setToolsUsage || !toolsUsage) return;
    
    const newToolsUsage = new Map(toolsUsage);
    const serverConfig = newToolsUsage.get(serverName);
    
    if (serverConfig) {
      newToolsUsage.set(serverName, {
        ...serverConfig,
        selectedTools: newSelectedTools,
      });
      setToolsUsage(newToolsUsage);
      console.log(`Updated selectedTools for ${serverName}:`, newSelectedTools);
    }
  };

  // Fetch tools when config data is loaded
  useEffect(() => {
    if (mcpData?.configs?.[0]) {
      const config = mcpData.configs[0];
      console.log('MCP Config loaded:', config);
      console.log('Tools in config:', config.tools);
      console.log('Config ID:', config.id);
      
      // Check if tools is an object with server names as keys
      if (config.tools && typeof config.tools === 'object' && Object.keys(config.tools).length > 0) {
        console.log('Using tools from config');
        setToolsByServer(config.tools as Record<string, MCPTool[]>);
        
        // Auto-select all tools by default
        if (setToolsUsage && config.config?.mcpServers) {
          const newToolsUsage = new Map<string, McpServerConfig>();
          
          // Create one config per server with its tools selected
          for (const serverName in config.tools) {
            const serverConfig = config.config.mcpServers[serverName];
            if (serverConfig) {
              const serverTools = (config.tools as any)[serverName] || [];
              const toolNames = serverTools.map((tool: MCPTool) => tool.name);
              
              newToolsUsage.set(serverName, {
                definition: {
                  filter: null,
                  type: 'http',
                  server_url: serverConfig.url,
                  headers: serverConfig.headers || {},
                  env: null,
                },
                selectedTools: toolNames,
              });
            }
          }
          
          setToolsUsage(newToolsUsage);
          console.log('Auto-selected all tools from config:', newToolsUsage);
        }
      } else if (config.id) {
        console.log('Fetching tools from API for config:', config.id);
        fetchTools(config.id);
      }
    }
  }, [mcpData]);

  const getServerIcon = (serverName: string) => {
    const name = serverName.toLowerCase();
    if (name.includes('wiki') || name.includes('search')) return Search;
    if (name.includes('file') || name.includes('document')) return FileText;
    if (name.includes('database') || name.includes('db')) return Database;
    if (name.includes('web') || name.includes('scrape')) return Globe;
    return Server;
  };

  const renderMCPServers = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading MCP servers...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center py-8">
          <AlertCircle className="w-6 h-6 text-destructive" />
          <span className="ml-2 text-destructive">Failed to load MCP servers</span>
        </div>
      );
    }

    if (!mcpData?.configs || mcpData.configs.length === 0) {
      return (
        <div className="text-center py-8">
          <Server className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No MCP servers configured</p>
        </div>
      );
    }

    const config = mcpData.configs[0]; // Use the first config as specified
    const servers = config?.config?.mcpServers || {};
    
    // Debug log to verify data structure
    console.log('MCP Data:', { config, servers, toolsByServer });

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Server className="w-5 h-5" />
            MCP Servers & Tools
          </h3>
          <div className="flex gap-2">
            {Object.keys(toolsByServer).length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUseAllTools}
              >
                Use All Tools
              </Button>
            )}
            <Button onClick={handleRefresh} disabled={toolsLoading} variant="outline" size="sm">
              {toolsLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Refreshing...
                </>
              ) : (
                'Refresh Tools'
              )}
            </Button>
          </div>
        </div>

        {toolsLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading tools...</span>
          </div>
        )}
        
        {toolsError && (
          <div className="flex items-center justify-center py-8">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <span className="ml-2 text-destructive">{toolsError}</span>
          </div>
        )}

        {!toolsLoading && !toolsError && (
          <div className="space-y-6">
            {Object.entries(servers).map(([serverName, serverConfig]) => {
              const IconComponent = getServerIcon(serverName);
              return (
                <div key={serverName} className="space-y-3">
                  {/* Server Header */}
                  <div className="flex items-center gap-3 p-4 border border-border rounded-lg bg-muted/30">
                    <div className="p-2 bg-background rounded-lg">
                      <IconComponent className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground capitalize">{serverName}</h4>
                      <p className="text-sm text-muted-foreground">{serverConfig.url}</p>
                    </div>
                  </div>

                  {/* Tools for this server */}
                  {(() => {
                    const serverTools = toolsByServer[serverName] || [];
                    return serverTools.length > 0 ? (
                      <div className="ml-4 space-y-2">
                        {serverTools.map((tool, index) => {
                          const isSelected = isToolSelected(tool.name, serverName);
                          return (
                            <div
                              key={index}
                              onClick={() => handleToggleTool(tool.name, serverName)}
                              className={`flex items-center gap-3 p-3 border rounded-lg transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-[rgb(var(--theme-500))] bg-[rgb(var(--theme-500))]/5'
                                  : 'border-border hover:bg-accent/50'
                              }`}
                            >
                              <div className={`p-2 rounded-lg ${
                                isSelected ? 'bg-[rgb(var(--theme-500))]/10' : 'bg-muted'
                              }`}>
                                <Plug className={`w-4 h-4 ${
                                  isSelected ? 'text-[rgb(var(--theme-600))]' : 'text-muted-foreground'
                                }`} />
                              </div>
                              <div className="flex-1">
                                <h5 className="font-medium text-foreground text-sm">{tool.name}</h5>
                                <p className="text-xs text-muted-foreground">
                                  {tool.description || 'No description available'}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="ml-4 text-center py-4 text-sm text-muted-foreground">
                        No tools available for this server
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Plug className="w-6 h-6 text-primary" />
            </div>
            <div>
              <DialogTitle>MCP Tools & Servers</DialogTitle>
              <DialogDescription>
                Manage your Model Context Protocol servers and available tools
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          {renderMCPServers()}
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-border">
          <div className="text-sm text-muted-foreground">
            {getSelectedToolsCount() > 0 && (
              <span className="font-medium text-foreground">
                {getSelectedToolsCount()} tool{getSelectedToolsCount() !== 1 ? 's' : ''} selected
              </span>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
