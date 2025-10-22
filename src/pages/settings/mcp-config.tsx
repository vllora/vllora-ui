import { useState, useEffect, useRef } from 'react';
import ReactJson from 'react-json-view';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Save, AlertCircle, Eye } from 'lucide-react';
import { useMCPConfigs } from '@/services/mcp-api';
import { getBackendUrl } from '@/config/api';
import { toast } from 'sonner';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export function McpConfigPage() {
  const { data: mcpData, loading, error, run: refetchConfigs } = useMCPConfigs();
  const [configJson, setConfigJson] = useState<any>(null);
  const [rawJson, setRawJson] = useState<string>('');
  const [jsonTab, setJsonTab] = useState<'editor' | 'raw'>('editor');
  const [saving, setSaving] = useState(false);
  const [previewingTools, setPreviewingTools] = useState(false);
  const [previewedTools, setPreviewedTools] = useState<Record<string, any[]> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load config when data is available
  useEffect(() => {
    if (mcpData?.configs?.[0]) {
      setConfigJson(mcpData.configs[0].config);
      setRawJson(JSON.stringify(mcpData.configs[0].config, null, 2));
    } else if (mcpData && (!mcpData.configs || mcpData.configs.length === 0)) {
      // Initialize with empty config if none exists
      const emptyConfig = {
        mcpServers: {}
      };
      setConfigJson(emptyConfig);
      setRawJson(JSON.stringify(emptyConfig, null, 2));
    }
  }, [mcpData]);

  // Sync raw JSON when switching tabs
  const handleTabChange = (tab: string) => {
    if (tab === 'raw' && configJson) {
      // Switching to raw - update raw JSON from editor
      setRawJson(JSON.stringify(configJson, null, 2));
    } else if (tab === 'editor' && rawJson) {
      // Switching to editor - try to parse raw JSON
      try {
        const parsed = JSON.parse(rawJson);
        setConfigJson(parsed);
      } catch (err) {
        toast.error('Invalid JSON', {
          description: 'Please fix the JSON syntax before switching to editor view',
        });
        return;
      }
    }
    setJsonTab(tab as 'editor' | 'raw');
  };

  const handleRawJsonChange = (value: string) => {
    setRawJson(value);
    // Try to parse and update configJson in real-time
    try {
      const parsed = JSON.parse(value);
      setConfigJson(parsed);
    } catch {
      // Invalid JSON, don't update configJson yet
    }
  };

  const handlePreviewTools = async () => {
    if (!configJson?.mcpServers) {
      toast.error('No MCP servers configured');
      return;
    }

    setPreviewingTools(true);
    setPreviewedTools(null);
    try {
      const response = await fetch(`${getBackendUrl()}/mcp-configs/tools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mcpServers: configJson.mcpServers,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to preview tools: ${response.statusText}`);
      }

      const tools = await response.json();
      console.log('Previewed tools:', tools);
      setPreviewedTools(tools);
      
      const totalTools = Object.values(tools).reduce((sum: number, serverTools: any) => 
        sum + (Array.isArray(serverTools) ? serverTools.length : 0), 0
      );
      
      toast.success('Tools preview loaded', {
        description: `Found ${totalTools} tool(s) across ${Object.keys(tools).length} server(s)`,
      });
    } catch (err) {
      console.error('Error previewing tools:', err);
      toast.error('Failed to preview tools', {
        description: err instanceof Error ? err.message : 'An error occurred',
      });
    } finally {
      setPreviewingTools(false);
    }
  };

  const handleSave = async () => {
    if (!configJson) return;

    setSaving(true);
    try {
      let response;
      
      if (mcpData?.configs?.[0]?.id) {
        // Update existing config
        response = await fetch(`${getBackendUrl()}/mcp-configs/${mcpData.configs[0].id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            config: configJson,
          }),
        });
      } else {
        // Create new config
        response = await fetch(`${getBackendUrl()}/mcp-configs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            config: configJson,
          }),
        });
      }

      if (!response.ok) {
        throw new Error(`Failed to save config: ${response.statusText}`);
      }

      toast.success('MCP configuration saved successfully');
      setPreviewedTools(null); // Clear preview after save
      await refetchConfigs();
    } catch (err) {
      console.error('Error saving config:', err);
      toast.error('Failed to save MCP configuration', {
        description: err instanceof Error ? err.message : 'An error occurred',
      });
    } finally {
      setSaving(false);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading MCP configuration...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <p className="text-destructive">Failed to load MCP configuration</p>
        <p className="text-sm text-muted-foreground mt-2">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">MCP Configuration</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Edit your Model Context Protocol server configuration
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviewTools}
            disabled={previewingTools || saving}
          >
            {previewingTools ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading...
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 mr-2" />
                Preview Tools
              </>
            )}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || previewingTools}
            className="bg-[rgb(var(--theme-600))] hover:bg-[rgb(var(--theme-700))]"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Config
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Config Info */}
      {mcpData?.configs?.[0] ? (
        <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border border-border">
          <div>
            <p className="text-xs text-muted-foreground">Config ID</p>
            <p className="text-sm font-mono">{mcpData.configs[0].id}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Company</p>
            <p className="text-sm">{mcpData.configs[0].company_slug}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Created</p>
            <p className="text-sm">{new Date(mcpData.configs[0].created_at).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Updated</p>
            <p className="text-sm">{new Date(mcpData.configs[0].updated_at).toLocaleString()}</p>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-muted/30 rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">
            No existing configuration found. Create a new MCP configuration below.
          </p>
        </div>
      )}

      {/* JSON Editor */}
      <div className="border border-border rounded-lg overflow-hidden">
        <Tabs value={jsonTab} onValueChange={handleTabChange} className="w-full">
          <div className="bg-muted/50 px-4 py-2 border-b border-border flex items-center justify-between">
            <p className="text-sm font-medium">MCP Servers Configuration</p>
            <TabsList className="bg-secondary/20 border border-border">
              <TabsTrigger
                className="data-[state=active]:bg-secondary data-[state=active]:text-white"
                value="editor"
              >
                Editor
              </TabsTrigger>
              <TabsTrigger
                className="data-[state=active]:bg-secondary data-[state=active]:text-white"
                value="raw"
              >
                Raw JSON
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="editor" className="p-4 bg-card m-0">
            {configJson && (
              <ReactJson
                src={configJson}
                theme="monokai"
                iconStyle="triangle"
                displayDataTypes={false}
                displayObjectSize={false}
                enableClipboard={true}
                onEdit={(edit) => {
                  setConfigJson(edit.updated_src);
                  setRawJson(JSON.stringify(edit.updated_src, null, 2));
                  return true;
                }}
                onAdd={(add) => {
                  setConfigJson(add.updated_src);
                  setRawJson(JSON.stringify(add.updated_src, null, 2));
                  return true;
                }}
                onDelete={(del) => {
                  setConfigJson(del.updated_src);
                  setRawJson(JSON.stringify(del.updated_src, null, 2));
                  return true;
                }}
                style={{
                  backgroundColor: 'transparent',
                  fontSize: '13px',
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="raw" className="p-0 bg-card m-0">
            <div className="relative bg-[#1e1e1e] rounded-b-lg overflow-hidden">
              <textarea
                ref={textareaRef}
                value={rawJson}
                onChange={(e) => handleRawJsonChange(e.target.value)}
                className="absolute top-0 left-0 w-full h-96 p-4 font-mono text-sm bg-transparent text-transparent caret-white resize-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--theme-600))] z-10 leading-6"
                style={{
                  caretColor: 'white',
                  WebkitTextFillColor: 'transparent',
                  lineHeight: '1.5rem',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  tabSize: 2 as unknown as string,
                }}
                spellCheck={false}
                placeholder='{\n  "mcpServers": {\n    ...\n  }\n}'
              />
              <div className="pointer-events-none">
                <SyntaxHighlighter
                  language="json"
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    padding: '1rem',
                    background: 'transparent',
                    fontSize: '0.875rem',
                    height: '24rem',
                    lineHeight: '1.5rem',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  }}
                  codeTagProps={{
                    style: {
                      margin: 0,
                      padding: 0,
                      lineHeight: '1.5rem',
                      fontSize: '0.875rem',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      tabSize: 2 as unknown as string,
                    },
                  }}
                  showLineNumbers={false}
                  wrapLines={false}
                  PreTag="div"
                >
                  {rawJson || '{\n  "mcpServers": {\n    \n  }\n}'}
                </SyntaxHighlighter>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Preview Tools Section */}
      {previewedTools && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 border-b border-border flex items-center justify-between">
            <p className="text-sm font-medium">Previewed Tools</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewedTools(null)}
              className="h-6 text-xs"
            >
              Clear
            </Button>
          </div>
          <div className="p-4 bg-card max-h-96 overflow-auto">
            <div className="space-y-4">
              {Object.entries(previewedTools).map(([serverName, tools]) => (
                <div key={serverName}>
                  <h4 className="font-medium text-sm mb-2 capitalize">{serverName}</h4>
                  {Array.isArray(tools) && tools.length > 0 ? (
                    <ul className="space-y-2 ml-4">
                      {tools.map((tool: any, index: number) => (
                        <li key={index} className="text-sm">
                          <span className="font-mono text-[rgb(var(--theme-600))]">{tool.name}</span>
                          {tool.description && (
                            <span className="text-muted-foreground ml-2">- {tool.description}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground ml-4">No tools available</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="text-xs text-muted-foreground space-y-1 p-4 bg-muted/20 rounded-lg">
        <p className="font-medium">Tips:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Editor tab:</strong> Click on values to edit inline, use + to add and - to delete properties</li>
          <li><strong>Raw JSON tab:</strong> Edit JSON directly as text with syntax validation</li>
          <li>Click "Preview Tools" to test your configuration before saving</li>
          <li>Don't forget to save your changes</li>
        </ul>
      </div>
    </div>
  );
}
