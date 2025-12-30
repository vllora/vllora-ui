/**
 * DistriProvider
 *
 * Wraps the application with Distri client context and:
 * 1. Initializes the Distri client with config
 * 2. Runs agent sync on mount to ensure agents are registered
 * 3. Provides connection state context to child components
 *
 * Note: Tool handlers are passed via `externalTools` prop in the Chat component,
 * so we don't need to manually register them here.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { DistriProvider as BaseDistriProvider } from '@distri/react';
import { ensureAgentsRegistered, checkDistriHealth, getDistriUrl } from '@/lib/agent-sync';

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

function DistriProviderInner({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize connection and sync agents
  const initialize = useCallback(async () => {
    setIsInitializing(true);
    setError(null);

    try {
      // Check server health
      const isHealthy = await checkDistriHealth();
      if (!isHealthy) {
        setError('Distri server is not available');
        setIsConnected(false);
        return;
      }

      // Ensure agents are registered
      const agentsOk = await ensureAgentsRegistered();
      if (!agentsOk) {
        console.warn('[DistriProvider] Some agents may be missing');
      }

      setIsConnected(true);
      console.log('[DistriProvider] Initialized successfully');
    } catch (err) {
      console.error('[DistriProvider] Initialization failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize');
      setIsConnected(false);
    } finally {
      setIsInitializing(false);
    }
  }, []);

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
  const distriUrl = getDistriUrl();

  // Config for DistriProvider (matches @distri/react API)
  // @distri/react expects baseUrl to include /api/v1 prefix
  const config = useMemo(() => ({
    baseUrl: `${distriUrl}/v1`,
    debug: import.meta.env.DEV,
  }), [distriUrl]);

  return (
    <BaseDistriProvider config={config}>
      <DistriProviderInner>{children}</DistriProviderInner>
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
