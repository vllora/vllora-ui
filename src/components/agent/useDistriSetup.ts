/**
 * useDistriSetup
 *
 * Hook for managing Distri server setup flow:
 * - Connection status checking
 * - URL management (get/save/validate)
 * - Platform detection
 * - Agent registration via vLLora BE
 */

import { useState, useCallback, useMemo } from 'react';
import {
  getDistriUrl,
  saveDistriUrl,
  checkDistriHealth,
} from '@/lib/agent-sync';
import {
  registerAgents,
  getLucyConfig,
  RegistrationResult,
  AgentRegistrationStatus,
  ProviderConfig,
  ModelSettingsConfig,
  LucyConfig,
} from '@/services/agents-api';

// ============================================================================
// Types
// ============================================================================

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'registering' | 'ready' | 'failed';

export interface PlatformInfo {
  os: 'darwin' | 'linux';
  arch: 'amd64' | 'arm64';
  osLabel: string;
  binary: string;
  downloadUrl: string;
}

// Re-export types from service for convenience
export type { RegistrationResult, AgentRegistrationStatus, ProviderConfig, ModelSettingsConfig };

export interface UseDistriSetupReturn {
  // Connection state
  connectionStatus: ConnectionStatus;
  errorMessage: string | null;

  // Agent registration state
  registrationResult: RegistrationResult | null;

  // URL management
  distriUrl: string;
  setDistriUrl: (url: string) => void;
  isValidUrl: boolean;

  // Model settings configuration (includes provider)
  modelSettings: ModelSettingsConfig;
  setModelSettings: (config: ModelSettingsConfig) => void;

  // Actions
  connect: () => Promise<boolean>;
  testConnection: () => Promise<boolean>;
  resetUrl: () => void;
  loadConfig: () => Promise<LucyConfig | null>;

  // Config loading state
  configLoading: boolean;

  // Platform info
  platform: PlatformInfo;
  allPlatforms: PlatformInfo[];
}

// ============================================================================
// Constants
// ============================================================================

// Direct download URL for latest release binaries
const GITHUB_DOWNLOAD_BASE = 'https://github.com/distrihub/distri/releases/latest/download';

// Helper to get direct download URL for a binary
function getDownloadUrl(binary: string): string {
  return `${GITHUB_DOWNLOAD_BASE}/${binary}`;
}

// ============================================================================
// Platform Detection
// ============================================================================

// Extended Navigator interface for userAgentData (not yet in all TS libs)
interface NavigatorUAData {
  platform: string;
  brands: Array<{ brand: string; version: string }>;
  mobile: boolean;
}

declare global {
  interface Navigator {
    userAgentData?: NavigatorUAData;
  }
}

function detectPlatform(): PlatformInfo {
  const userAgent = navigator.userAgent.toLowerCase();

  // Try modern userAgentData API first, fallback to userAgent parsing
  const uaPlatform = navigator.userAgentData?.platform?.toLowerCase() || '';

  // Detect OS (Windows not supported yet)
  let os: 'darwin' | 'linux' = 'linux';
  let osLabel = 'Linux';

  if (uaPlatform === 'macos' || userAgent.includes('mac os') || userAgent.includes('macintosh')) {
    os = 'darwin';
    osLabel = 'macOS';
  }

  // Detect architecture (best effort - browser detection is limited)
  let arch: 'amd64' | 'arm64' = 'amd64';

  // Check for ARM in userAgent (works on some browsers)
  if (userAgent.includes('arm64') || userAgent.includes('aarch64')) {
    arch = 'arm64';
  }
  // For macOS, default to Apple Silicon for modern Macs
  // Intel Macs typically have "Intel" in userAgent, Apple Silicon doesn't
  if (os === 'darwin' && !userAgent.includes('intel')) {
    arch = 'arm64';
  }

  const binary = `distri-${os}-${arch}.tar.gz`;

  return {
    os,
    arch,
    osLabel,
    binary,
    downloadUrl: getDownloadUrl(binary),
  };
}

function getAllPlatforms(): PlatformInfo[] {
  const platforms: Array<{ os: 'darwin' | 'linux'; arch: 'amd64' | 'arm64'; osLabel: string }> = [
    { os: 'darwin', arch: 'arm64', osLabel: 'macOS (Apple Silicon)' },
    { os: 'darwin', arch: 'amd64', osLabel: 'macOS (Intel)' },
    { os: 'linux', arch: 'amd64', osLabel: 'Linux (x64)' },
    { os: 'linux', arch: 'arm64', osLabel: 'Linux (arm64)' },
  ];

  return platforms.map(({ os, arch, osLabel }) => {
    const binary = `distri-${os}-${arch}.tar.gz`;
    return {
      os,
      arch,
      osLabel,
      binary,
      downloadUrl: getDownloadUrl(binary),
    };
  });
}

// ============================================================================
// URL Validation
// ============================================================================

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// ============================================================================
// Hook
// ============================================================================

// Default model settings with vllora provider pointing to local BE
const DEFAULT_MODEL_SETTINGS: ModelSettingsConfig = {
  provider: {
    name: 'vllora',
    base_url: 'http://localhost:9093/v1',
  },
};

export function useDistriSetup(initialStatus: ConnectionStatus = 'idle'): UseDistriSetupReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(initialStatus);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [distriUrl, setDistriUrlState] = useState<string>(() => getDistriUrl());
  const [registrationResult, setRegistrationResult] = useState<RegistrationResult | null>(null);
  const [modelSettings, setModelSettingsState] = useState<ModelSettingsConfig>(DEFAULT_MODEL_SETTINGS);
  const [configLoading, setConfigLoading] = useState(false);

  // Validate URL
  const isValidUrl = useMemo(() => validateUrl(distriUrl), [distriUrl]);

  // Platform detection
  const platform = useMemo(() => detectPlatform(), []);
  const allPlatforms = useMemo(() => getAllPlatforms(), []);

  // Set URL (with validation)
  const setDistriUrl = useCallback((url: string) => {
    setDistriUrlState(url);
    // Clear error when URL changes
    setErrorMessage(null);
    setConnectionStatus('idle');
  }, []);

  // Set model settings (resets status to allow re-saving)
  const setModelSettings = useCallback((config: ModelSettingsConfig) => {
    setModelSettingsState(config);
    // Reset status when settings change so user can save again
    setConnectionStatus('idle');
  }, []);

  // Reset URL to default
  const resetUrl = useCallback(() => {
    const defaultUrl = import.meta.env.VITE_DISTRI_URL || 'http://localhost:8081';
    setDistriUrlState(defaultUrl);
    setErrorMessage(null);
    setConnectionStatus('idle');
  }, []);

  // Load saved config from BE
  const loadConfig = useCallback(async (): Promise<LucyConfig | null> => {
    setConfigLoading(true);
    try {
      const config = await getLucyConfig();
      // Apply loaded config
      if (config.distri_url) {
        setDistriUrlState(config.distri_url);
      }
      if (config.model_settings) {
        setModelSettingsState(config.model_settings);
      }
      // If we have a saved config, mark as ready (already configured)
      if (config.distri_url) {
        setConnectionStatus('ready');
      }
      return config;
    } catch {
      // Config not found or error - use defaults
      return null;
    } finally {
      setConfigLoading(false);
    }
  }, []);

  // Test connection only (no registration)
  const testConnection = useCallback(async (): Promise<boolean> => {
    if (!isValidUrl) {
      setErrorMessage('Invalid URL format');
      setConnectionStatus('failed');
      return false;
    }

    setConnectionStatus('connecting');
    setErrorMessage(null);

    const isConnected = await checkDistriHealth(distriUrl);

    if (isConnected) {
      saveDistriUrl(distriUrl);
      setConnectionStatus('connected');
      return true;
    } else {
      setConnectionStatus('failed');
      setErrorMessage('Could not connect. Make sure the Distri server is running.');
      return false;
    }
  }, [distriUrl, isValidUrl]);

  // Connect with retry logic, then register agents via BE
  const connect = useCallback(async (): Promise<boolean> => {
    if (!isValidUrl) {
      setErrorMessage('Invalid URL format');
      setConnectionStatus('failed');
      return false;
    }

    setConnectionStatus('connecting');
    setErrorMessage(null);
    setRegistrationResult(null);

    // Retry logic: try every 1 second for up to 5 seconds
    const maxAttempts = 5;
    const retryDelay = 1000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const isConnected = await checkDistriHealth(distriUrl);

      if (isConnected) {
        // Save the URL on successful connection
        saveDistriUrl(distriUrl);
        setConnectionStatus('connected');

        // Now register agents via vLLora BE
        setConnectionStatus('registering');
        try {
          const result = await registerAgents({
            distri_url: distriUrl,
            model_settings: modelSettings,
          });
          setRegistrationResult(result);

          const allSuccess = result.agents.every((a: AgentRegistrationStatus) => a.success);
          if (allSuccess && result.agents.length > 0) {
            setConnectionStatus('ready');
            return true;
          } else if (result.agents.length === 0) {
            setErrorMessage('No agents found to register');
            setConnectionStatus('failed');
            return false;
          } else {
            // Some agents failed
            const failedAgents = result.agents.filter((a: AgentRegistrationStatus) => !a.success);
            setErrorMessage(`Failed to register ${failedAgents.length} agent(s)`);
            setConnectionStatus('failed');
            return false;
          }
        } catch {
          setErrorMessage('Failed to register agents with vLLora server');
          setConnectionStatus('failed');
          return false;
        }
      }

      // Don't wait after the last attempt
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    // All attempts failed
    setConnectionStatus('failed');
    setErrorMessage('Could not connect. Make sure the Distri server is running.');
    return false;
  }, [distriUrl, isValidUrl, modelSettings]);

  return {
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
    resetUrl,
    loadConfig,
    configLoading,
    platform,
    allPlatforms,
  };
}

export default useDistriSetup;
