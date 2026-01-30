/**
 * LucyWelcome
 *
 * Empty state / welcome message for Lucy chat.
 * Shows greeting and quick action buttons.
 */

import { LucyAvatar } from './LucyAvatar';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface QuickAction {
  /** Unique ID for the action */
  id: string;
  /** Icon emoji or component */
  icon: string;
  /** Label text */
  label: string;
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
}

// ============================================================================
// Component
// ============================================================================

export function LucyWelcome({
  quickActions = [],
  onQuickAction,
  className,
  proactivePrompt,
}: LucyWelcomeProps) {
  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      {/* Header: avatar + name + timestamp */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <LucyAvatar size="sm" />
        <span className="font-medium text-foreground">Lucy</span>
        <span>•</span>
        <span>Just now</span>
      </div>

      {/* Welcome message bubble */}
      <div className="max-w-[85%] bg-muted/50 border border-border rounded-2xl rounded-tl-sm px-4 py-3 ml-10">
        <div className="space-y-3">
          {/* Greeting text - use proactivePrompt if provided */}
          {proactivePrompt ? (
            <p className="text-sm">{proactivePrompt}</p>
          ) : (
            <>
              <p className="text-sm">
                Hello! I'm Lucy, your VLlora AI assistant. I can help you analyze
                traces, filter complex logs, or optimize your LLM prompts based on
                recent performance data.
              </p>
              <p className="text-sm">How can I help you today?</p>
            </>
          )}

          {/* Quick action buttons */}
          {quickActions.length > 0 && (
            <div className="flex flex-col gap-2 pt-2">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => onQuickAction?.(action)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2',
                    'bg-background/50 hover:bg-background',
                    'border border-border rounded-lg',
                    'text-sm text-left transition-colors',
                    'hover:border-primary/50'
                  )}
                >
                  <span className="text-base">{action.icon}</span>
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LucyWelcome;
