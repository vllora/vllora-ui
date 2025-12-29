/**
 * useDistriSetup
 *
 * Hook for managing Distri server setup flow:
 * - Connection status checking
 * - URL management (get/save/validate)
 * - Platform detection
 * - Retry logic
 */

import { useState, useCallback, useMemo } from 'react';
import {
  getDistriUrl,
  saveDistriUrl,
  checkDistriHealth,
} from '@/lib/agent-sync';

// ============================================================================
// Types
// ============================================================================

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed';

export interface PlatformInfo {
  os: 'darwin' | 'linux';
  arch: 'amd64' | 'arm64';
  osLabel: string;
  binary: string;
  downloadUrl: string;
}

export interface UseDistriSetupReturn {
  // Connection state
  connectionStatus: ConnectionStatus;
  errorMessage: string | null;

  // URL management
  distriUrl: string;
  setDistriUrl: (url: string) => void;
  isValidUrl: boolean;

  // Actions
  connect: () => Promise<boolean>;
  resetUrl: () => void;

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

export function useDistriSetup(): UseDistriSetupReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [distriUrl, setDistriUrlState] = useState<string>(() => getDistriUrl());

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

  // Reset URL to default
  const resetUrl = useCallback(() => {
    const defaultUrl = import.meta.env.VITE_DISTRI_URL || 'http://localhost:8081';
    setDistriUrlState(defaultUrl);
    setErrorMessage(null);
    setConnectionStatus('idle');
  }, []);

  // Connect with retry logic
  const connect = useCallback(async (): Promise<boolean> => {
    if (!isValidUrl) {
      setErrorMessage('Invalid URL format');
      setConnectionStatus('failed');
      return false;
    }

    setConnectionStatus('connecting');
    setErrorMessage(null);

    // Retry logic: try every 1 second for up to 5 seconds
    const maxAttempts = 5;
    const retryDelay = 1000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const isConnected = await checkDistriHealth(distriUrl);

      if (isConnected) {
        // Save the URL on successful connection
        saveDistriUrl(distriUrl);
        setConnectionStatus('connected');
        return true;
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
  }, [distriUrl, isValidUrl]);

  return {
    connectionStatus,
    errorMessage,
    distriUrl,
    setDistriUrl,
    isValidUrl,
    connect,
    resetUrl,
    platform,
    allPlatforms,
  };
}

export default useDistriSetup;
