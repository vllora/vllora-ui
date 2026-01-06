/**
 * LucySetupGuide
 *
 * Inline setup guide for configuring Distri server connection.
 * Appears in the Lucy panel when not connected.
 *
 * Design: Option B (Inline Panel) from lucy-setup-flow.md
 */

import { useCallback, useState, useEffect } from 'react';
import { Copy, Check, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { LucyAvatar } from './LucyAvatar';
import { PlatformDownload } from '../PlatformDownload';
import { ConnectionStatus } from '../ConnectionStatus';
import { useDistriSetup, ProviderConfig, ModelSettingsConfig, ConnectionStatus as ConnectionStatusType } from '../useDistriSetup';

// ============================================================================
// Types
// ============================================================================

interface LucySetupGuideProps {
  /** Mode: 'setup' for first-time users, 'settings' for returning users adjusting config */
  mode?: 'setup' | 'settings';
  /** Initial connection status (useful when opening settings while already connected) */
  initialStatus?: ConnectionStatusType;
  /** Callback when connection is successful */
  onConnected: () => void;
  /** Optional className */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function LucySetupGuide({ mode = 'setup', initialStatus, onConnected, className }: LucySetupGuideProps) {
  const {
    connectionStatus,
    errorMessage,
    registrationResult,
    distriUrl,
    setDistriUrl,
    isValidUrl,
    modelSettings,
    setModelSettings,
    connect,
    testConnection,
    loadConfig,
    configLoading,
    platform,
    allPlatforms,
  } = useDistriSetup(initialStatus);

  const isSettingsMode = mode === 'settings';

  // Load saved config when opening settings mode
  useEffect(() => {
    if (isSettingsMode) {
      loadConfig();
    }
  }, [isSettingsMode, loadConfig]);

  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(isSettingsMode); // Expanded by default in settings mode

  // Helper to get current provider config (with defaults)
  const providerConfig = modelSettings.provider || { name: 'vllora' as const };

  // Default URLs for each provider
  const PROVIDER_DEFAULT_URLS: Record<ProviderConfig['name'], string> = {
    vllora: 'http://localhost:9090/v1',
    openai: 'https://api.openai.com/v1',
    openai_compat: '',
  };

  // Update model settings field (top-level: model, temperature, max_tokens)
  const updateModelField = (field: keyof ModelSettingsConfig, value: string | number | undefined) => {
    setModelSettings({
      ...modelSettings,
      [field]: value,
    });
  };

  // Update provider config field (nested under modelSettings.provider)
  // Different providers have different valid fields:
  // - openai: NO additional fields
  // - openai_compat: base_url, api_key, project_id
  // - vllora: base_url only
  const updateProviderField = (field: keyof ProviderConfig, value: string) => {
    if (field === 'name') {
      const newName = value as ProviderConfig['name'];
      // Set appropriate fields based on provider type
      const newProvider: ProviderConfig = { name: newName };

      if (newName === 'vllora') {
        // vllora only has base_url
        newProvider.base_url = PROVIDER_DEFAULT_URLS.vllora;
      } else if (newName === 'openai_compat') {
        // openai_compat has base_url, api_key, project_id
        newProvider.base_url = providerConfig.base_url || '';
        newProvider.api_key = providerConfig.api_key;
        newProvider.project_id = providerConfig.project_id;
      }
      // openai has no additional fields

      setModelSettings({
        ...modelSettings,
        provider: newProvider,
      });
    } else {
      setModelSettings({
        ...modelSettings,
        provider: {
          ...providerConfig,
          [field]: value || undefined,
        },
      });
    }
  };

  // Combined extract and run command - copy distri-server to same dir so distri serve works
  const extractedFolder = `${platform.os}-${platform.arch}`;
  const runCommand = `tar -xzf ${platform.binary} && cd ${extractedFolder} && cp server/distri-server . && ./distri serve`;

  // Copy command to clipboard
  const handleCopyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(runCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = runCommand;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [runCommand]);

  // Handle connect button click
  const handleConnect = useCallback(async () => {
    const success = await connect();
    if (success) {
      // Brief delay to show success state before transitioning
      setTimeout(onConnected, 500);
    }
  }, [connect, onConnected]);

  // Handle test connection button click (settings mode only)
  const handleTestConnection = useCallback(async () => {
    await testConnection();
  }, [testConnection]);

  const isConnecting = connectionStatus === 'connecting';
  const isRegistering = connectionStatus === 'registering';
  const isReady = connectionStatus === 'ready';
  const isInProgress = isConnecting || isRegistering || configLoading;

  return (
    <div className={cn('flex flex-col h-full p-4 overflow-y-auto', className)}>
      {/* Header */}
      <div className="flex flex-col items-center mb-6">
        <LucyAvatar size="lg" className="mb-3" />
        <h2 className="text-base font-semibold">
          {isSettingsMode ? 'Lucy Settings' : 'Set Up Lucy'}
        </h2>
        <p className="text-xs text-muted-foreground text-center mt-1">
          {isSettingsMode
            ? 'Configure your Distri server connection and model settings.'
            : 'Lucy needs the Distri server to work.'}
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-5 flex-1">
        {/* Step 1: Download (setup mode only) */}
        {!isSettingsMode && (
          <StepSection number={1} title="Download Distri">
            <PlatformDownload platform={platform} allPlatforms={allPlatforms} />
          </StepSection>
        )}

        {/* Step 2: Extract & Run (setup mode only) */}
        {!isSettingsMode && (
          <StepSection number={2} title="Extract & Run">
            <div className="relative">
              <div className="bg-muted rounded-md p-2.5 pr-10 font-mono text-xs overflow-x-auto">
                <code className="whitespace-nowrap">{runCommand}</code>
              </div>
              <button
                onClick={handleCopyCommand}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-background/50 rounded transition-colors"
                title={copied ? 'Copied!' : 'Copy command'}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Run in terminal where you downloaded. Keep it open.
            </p>
          </StepSection>
        )}

        {/* Step 3: Connect (or just "Connection" in settings mode) */}
        <StepSection number={isSettingsMode ? undefined : 3} title={isSettingsMode ? 'Connection' : 'Connect'}>
          <div className="space-y-3">
            {/* Server URL input */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">
                Distri Server URL
              </label>
              <Input
                type="text"
                value={distriUrl}
                onChange={(e) => setDistriUrl(e.target.value)}
                placeholder="http://localhost:8081"
                className={cn(
                  'h-8 text-sm font-mono',
                  !isValidUrl && distriUrl && 'border-red-500 focus-visible:ring-red-500'
                )}
                disabled={isInProgress}
              />
              {!isValidUrl && distriUrl && (
                <p className="text-xs text-red-500 mt-1">Invalid URL format</p>
              )}
            </div>

            {/* Advanced Settings Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              disabled={isInProgress}
            >
              {showAdvanced ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Model Settings
            </button>

            {/* Advanced Settings Panel */}
            {showAdvanced && (
              <div className="space-y-3 p-3 bg-muted/50 rounded-md border">
                {/* Model Name */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">
                    Model
                  </label>
                  <Input
                    type="text"
                    value={modelSettings.model || ''}
                    onChange={(e) => updateModelField('model', e.target.value || undefined)}
                    placeholder="gpt-4o (uses agent default)"
                    className="h-8 text-sm font-mono"
                    disabled={isInProgress}
                  />
                </div>

                {/* Temperature & Max Tokens in a row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">
                      Temperature
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={modelSettings.temperature ?? ''}
                      onChange={(e) => updateModelField('temperature', e.target.value ? parseFloat(e.target.value) : undefined)}
                      placeholder="0.7"
                      className="h-8 text-sm font-mono"
                      disabled={isInProgress}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">
                      Max Tokens
                    </label>
                    <Input
                      type="number"
                      step="100"
                      min="1"
                      value={modelSettings.max_tokens ?? ''}
                      onChange={(e) => updateModelField('max_tokens', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                      placeholder="4096"
                      className="h-8 text-sm font-mono"
                      disabled={isInProgress}
                    />
                  </div>
                </div>

                {/* Provider Type */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">
                    Provider
                  </label>
                  <Select
                    value={providerConfig.name}
                    onValueChange={(value: 'openai' | 'openai_compat' | 'vllora') =>
                      updateProviderField('name', value)
                    }
                    disabled={isInProgress}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vllora">vLLora (Default)</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="openai_compat">OpenAI Compatible</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {providerConfig.name === 'vllora' && 'Routes through vLLora for observability'}
                    {providerConfig.name === 'openai' && 'Direct OpenAI API (uses OPENAI_API_KEY)'}
                    {providerConfig.name === 'openai_compat' && 'OpenAI-compatible endpoint'}
                  </p>
                </div>

                {/* Base URL (for vllora and openai_compat only - openai has no fields) */}
                {(providerConfig.name === 'vllora' || providerConfig.name === 'openai_compat') && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">
                      Base URL
                    </label>
                    <Input
                      type="text"
                      value={providerConfig.base_url || ''}
                      onChange={(e) => updateProviderField('base_url', e.target.value)}
                      placeholder={
                        providerConfig.name === 'vllora'
                          ? 'http://localhost:9090/v1'
                          : 'Enter API endpoint'
                      }
                      className="h-8 text-sm font-mono"
                      disabled={isInProgress}
                    />
                  </div>
                )}

                {/* API Key (for openai_compat only - openai uses env var) */}
                {providerConfig.name === 'openai_compat' && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">
                      API Key
                    </label>
                    <Input
                      type="password"
                      value={providerConfig.api_key || ''}
                      onChange={(e) => updateProviderField('api_key', e.target.value)}
                      placeholder="sk-..."
                      className="h-8 text-sm font-mono"
                      disabled={isInProgress}
                    />
                  </div>
                )}

                {/* Project ID (for openai_compat only) */}
                {providerConfig.name === 'openai_compat' && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">
                      Project ID
                    </label>
                    <Input
                      type="text"
                      value={providerConfig.project_id || ''}
                      onChange={(e) => updateProviderField('project_id', e.target.value)}
                      placeholder="Optional project ID"
                      className="h-8 text-sm font-mono"
                      disabled={isInProgress}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Connection status */}
            <ConnectionStatus status={connectionStatus} errorMessage={errorMessage} />

            {/* Buttons */}
            <div className={isSettingsMode ? 'flex gap-2' : ''}>
              {/* Test Connection button (settings mode only) */}
              {isSettingsMode && (
                <Button
                  onClick={handleTestConnection}
                  disabled={!isValidUrl || isInProgress}
                  variant="outline"
                  className="flex-1"
                  size="sm"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : connectionStatus === 'connected' ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Connected
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>
              )}

              {/* Connect/Save button */}
              <Button
                onClick={handleConnect}
                disabled={!isValidUrl || isInProgress || isReady}
                className={isSettingsMode ? 'flex-1' : 'w-full'}
                size="sm"
              >
                {isConnecting && !isSettingsMode ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting to Distri...
                  </>
                ) : isRegistering ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Registering agents...
                  </>
                ) : isReady ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    {isSettingsMode ? 'Saved!' : 'Ready!'}
                  </>
                ) : connectionStatus === 'failed' ? (
                  'Retry'
                ) : isSettingsMode ? (
                  'Save & Register'
                ) : (
                  'Connect to Lucy'
                )}
              </Button>
            </div>

            {/* Show registration result */}
            {registrationResult && registrationResult.agents.length > 0 && (
              <div className="text-xs text-muted-foreground mt-2">
                <p className="font-medium mb-1">Agents registered:</p>
                <ul className="space-y-0.5">
                  {registrationResult.agents.map((agent) => (
                    <li key={agent.name} className="flex items-center gap-1">
                      {agent.success ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <span className="h-3 w-3 text-red-500">✗</span>
                      )}
                      <span>{agent.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </StepSection>
      </div>
    </div>
  );
}

// ============================================================================
// Step Section Component
// ============================================================================

interface StepSectionProps {
  number?: number;
  title: string;
  children: React.ReactNode;
}

function StepSection({ number, title, children }: StepSectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {number !== undefined && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium">
            {number}
          </span>
        )}
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <div className={number !== undefined ? 'pl-7' : ''}>{children}</div>
    </div>
  );
}

export default LucySetupGuide;
