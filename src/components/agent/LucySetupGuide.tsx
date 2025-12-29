/**
 * LucySetupGuide
 *
 * Inline setup guide for configuring Distri server connection.
 * Appears in the Lucy panel when not connected.
 *
 * Design: Option B (Inline Panel) from lucy-setup-flow.md
 */

import { useCallback, useState } from 'react';
import { Copy, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { LucyAvatar } from './LucyAvatar';
import { PlatformDownload } from './PlatformDownload';
import { ConnectionStatus } from './ConnectionStatus';
import { useDistriSetup } from './useDistriSetup';

// ============================================================================
// Types
// ============================================================================

interface LucySetupGuideProps {
  /** Callback when connection is successful */
  onConnected: () => void;
  /** Optional className */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function LucySetupGuide({ onConnected, className }: LucySetupGuideProps) {
  const {
    connectionStatus,
    errorMessage,
    distriUrl,
    setDistriUrl,
    isValidUrl,
    connect,
    platform,
    allPlatforms,
  } = useDistriSetup();

  const [copied, setCopied] = useState(false);

  // The extracted folder contains distri-server binary in server/ subdirectory
  const extractedFolder = `${platform.os}-${platform.arch}`;
  const runCommand = `./${extractedFolder}/server/distri-server`;

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

  const isConnecting = connectionStatus === 'connecting';
  const isConnected = connectionStatus === 'connected';

  return (
    <div className={cn('flex flex-col h-full p-4 overflow-y-auto', className)}>
      {/* Header */}
      <div className="flex flex-col items-center mb-6">
        <LucyAvatar size="lg" className="mb-3" />
        <h2 className="text-base font-semibold">Set Up Lucy</h2>
        <p className="text-xs text-muted-foreground text-center mt-1">
          Lucy needs the Distri server to work.
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-5 flex-1">
        {/* Step 1: Download */}
        <StepSection number={1} title="Download Distri">
          <PlatformDownload platform={platform} allPlatforms={allPlatforms} />
        </StepSection>

        {/* Step 2: Extract */}
        <StepSection number={2} title="Extract the file">
          <p className="text-xs text-muted-foreground">
            Double-click the downloaded <code className="bg-muted px-1 rounded">.tar.gz</code> file to extract it.
          </p>
        </StepSection>

        {/* Step 3: Run */}
        <StepSection number={3} title="Run in terminal">
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
            Run this in the folder where you extracted. Keep terminal open.
          </p>
        </StepSection>

        {/* Step 4: Connect */}
        <StepSection number={4} title="Connect">
          <div className="space-y-3">
            {/* Server URL input */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">
                Server URL
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
                disabled={isConnecting || isConnected}
              />
              {!isValidUrl && distriUrl && (
                <p className="text-xs text-red-500 mt-1">Invalid URL format</p>
              )}
            </div>

            {/* Connection status */}
            <ConnectionStatus status={connectionStatus} errorMessage={errorMessage} />

            {/* Connect button */}
            <Button
              onClick={handleConnect}
              disabled={!isValidUrl || isConnecting || isConnected}
              className="w-full"
              size="sm"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : isConnected ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Connected!
                </>
              ) : connectionStatus === 'failed' ? (
                'Retry'
              ) : (
                'Connect to Lucy'
              )}
            </Button>
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
  number: number;
  title: string;
  children: React.ReactNode;
}

function StepSection({ number, title, children }: StepSectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium">
          {number}
        </span>
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <div className="pl-7">{children}</div>
    </div>
  );
}

export default LucySetupGuide;
