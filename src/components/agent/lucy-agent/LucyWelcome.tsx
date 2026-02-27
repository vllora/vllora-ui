/**
 * LucyWelcome
 *
 * Empty state / welcome message for Lucy chat.
 * Shows greeting and quick action buttons.
 */

import type { ReactNode } from 'react';
import { LucyAvatar } from './LucyAvatar';
import { cn } from '@/lib/utils';


// ============================================================================
// Types
// ============================================================================

export interface QuickAction {
  /** Unique ID for the action */
  id: string;
  /** Icon: Lucide component or ReactNode */
  icon: ReactNode;
  /** Label text shown on the button */
  label: string;
  /** Structured prompt sent to the agent (falls back to label if not set) */
  prompt?: string;
}

export interface LucyWelcomeProps {
  /** Quick action buttons to display */
  quickActions?: QuickAction[];
  /** Callback when a quick action is clicked */
  onQuickAction?: (action: QuickAction) => void;
  /** Optional className */
  className?: string;
  /** Proactive prompt to show instead of default greeting */
  proactivePrompt?: string | null;
  /** Status summary for existing datasets (takes priority over proactivePrompt) */
  statusSummary?: ReactNode;
}

// ============================================================================
// Component
// ============================================================================

export function LucyWelcome({
  quickActions = [],
  onQuickAction,
  className,
  proactivePrompt,
  statusSummary,
}: LucyWelcomeProps) {
  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      {/* Header: tiny avatar + name + timestamp */}
      <div className="flex items-center gap-1.5">
        <LucyAvatar size="xs" />
        <span className="text-xs font-medium text-muted-foreground">
          Lucy <span>• Just now</span>
        </span>
      </div>

      {/* Welcome message — flat, no bubble */}
      <div className="max-w-[100%] space-y-2">
        {/* Greeting text - statusSummary > proactivePrompt > default */}
        {statusSummary ? (
          statusSummary
        ) : proactivePrompt ? (
          <p className="text-sm">{proactivePrompt}</p>
        ) : (
          <>
            <p className="text-sm">
              Hello! I'm Lucy, your fine-tuning assistant. I can help you organize
              training data, set up evaluation criteria, run dry-run tests, and
              start training jobs.
            </p>
            <p className="text-sm">How can I help you today?</p>
          </>
        )}

        {/* Quick action buttons */}
        {quickActions.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-1">
            {quickActions.map((action) => (
              <button
                key={action.id}
                onClick={() => onQuickAction?.(action)}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-1.5',
                  'hover:bg-muted/50',
                  'border border-border/50 rounded-lg',
                  'text-sm text-left transition-colors',
                  'hover:border-primary/50'
                )}
              >
                <span className="text-muted-foreground shrink-0">{action.icon}</span>
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default LucyWelcome;
