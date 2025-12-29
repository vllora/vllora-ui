/**
 * ConnectionStatus
 *
 * Visual indicator for Distri server connection status.
 * Shows different states: idle, connecting, connected, failed.
 */

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConnectionStatus as ConnectionStatusType } from './useDistriSetup';

// ============================================================================
// Types
// ============================================================================

interface ConnectionStatusProps {
  /** Current connection status */
  status: ConnectionStatusType;
  /** Error message to display on failure */
  errorMessage?: string | null;
  /** Optional className */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ConnectionStatus({
  status,
  errorMessage,
  className,
}: ConnectionStatusProps) {
  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      {/* Status indicator */}
      <StatusDot status={status} />

      {/* Status text */}
      <span
        className={cn(
          'text-xs',
          status === 'idle' && 'text-muted-foreground',
          status === 'connecting' && 'text-blue-500',
          status === 'connected' && 'text-green-500',
          status === 'failed' && 'text-red-500'
        )}
      >
        {status === 'idle' && 'Not connected'}
        {status === 'connecting' && 'Connecting...'}
        {status === 'connected' && 'Connected!'}
        {status === 'failed' && (errorMessage || 'Connection failed')}
      </span>
    </div>
  );
}

// ============================================================================
// Status Dot Component
// ============================================================================

function StatusDot({ status }: { status: ConnectionStatusType }) {
  if (status === 'connecting') {
    return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
  }

  return (
    <span
      className={cn(
        'h-2 w-2 rounded-full',
        status === 'idle' && 'bg-muted-foreground animate-pulse',
        status === 'connected' && 'bg-green-500',
        status === 'failed' && 'bg-red-500'
      )}
    />
  );
}

export default ConnectionStatus;
