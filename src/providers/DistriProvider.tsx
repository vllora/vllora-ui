/**
 * DistriProvider
 *
 * Wraps the application with Distri client context and:
 * 1. Initializes the Distri client with config
 * 2. Provides connection state context to child components
 *
 * Note: Agent registration is handled by LucySetupGuide via POST /agents/register
 * Tool handlers are passed via `externalTools` prop in the Chat component.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { DistriProvider as BaseDistriProvider } from '@distri/react';
import { checkDistriHealth, fetchLucyConfig, LucyConfig } from '@/lib/agent-sync';
import { getDistriUrl } from '@/config/api';

// ============================================================================
// Types
// ============================================================================

interface DistriContextValue {
  isConnected: boolean;
  isInitializing: boolean;
  error: string | null;
  reconnect: () => Promise<void>;
}

const DistriContext = createContext<DistriContextValue>({
  isConnected: false,
  isInitializing: true,
  error: null,
  reconnect: async () => {},
});

// ============================================================================
// Inner Provider (handles initialization)
// ============================================================================

interface DistriProviderInnerProps {
  children: React.ReactNode;
  distriUrl: string;
}

function DistriProviderInner({ children, distriUrl }: DistriProviderInnerProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize connection check
  const initialize = useCallback(async () => {
    setIsInitializing(true);
    setError(null);

    try {
      // Check server health
      const isHealthy = await checkDistriHealth(distriUrl);
      if (!isHealthy) {
        setError('Distri server is not available');
        setIsConnected(false);
        return;
      }

      // Agent registration is handled by LucySetupGuide via POST /agents/register
      setIsConnected(true);
      console.log('[DistriProvider] Connected to Distri server');
    } catch (err) {
      console.error('[DistriProvider] Connection check failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setIsConnected(false);
    } finally {
      setIsInitializing(false);
    }
  }, [distriUrl]);

  // Reconnect function
  const reconnect = useCallback(async () => {
    await initialize();
  }, [initialize]);

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  const contextValue = useMemo(
    () => ({
      isConnected,
      isInitializing,
      error,
      reconnect,
    }),
    [isConnected, isInitializing, error, reconnect]
  );

  return (
    <DistriContext.Provider value={contextValue}>
      {children}
    </DistriContext.Provider>
  );
}

// ============================================================================
// Main Provider
// ============================================================================

interface DistriProviderProps {
  children: React.ReactNode;
}

export function DistriProvider({ children }: DistriProviderProps) {
  const [lucyConfig, setLucyConfig] = useState<LucyConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  // Fetch config from backend API on mount
  useEffect(() => {
    let mounted = true;

    async function loadConfig() {
      try {
        const config = await fetchLucyConfig();
        if (mounted) {
          setLucyConfig(config);
        }
      } catch (err) {
        console.warn('[DistriProvider] Failed to fetch config from API, using defaults:', err);
        if (mounted) {
          setLucyConfig({});
        }
      } finally {
        if (mounted) {
          setIsLoadingConfig(false);
        }
      }
    }

    loadConfig();
    return () => { mounted = false; };
  }, []);

  const distriUrl = lucyConfig?.distri_url || getDistriUrl();

  // Config for DistriProvider (matches @distri/react API)
  // @distri/react expects baseUrl to include /api/v1 prefix
  const config = useMemo(() => ({
    baseUrl: `${distriUrl}/v1`,
    debug: import.meta.env.DEV,
  }), [distriUrl]);

  // Show loading state while fetching config
  if (isLoadingConfig) {
    return null;
  }

  return (
    <BaseDistriProvider config={config}>
      <DistriProviderInner distriUrl={distriUrl}>{children}</DistriProviderInner>
    </BaseDistriProvider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access Distri connection state
 */
export function useDistriConnection() {
  return useContext(DistriContext);
}

export default DistriProvider;
