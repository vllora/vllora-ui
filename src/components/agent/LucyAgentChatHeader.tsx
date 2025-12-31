/**
 * LucyAgentChatHeader
 *
 * Header component for Lucy agent chat panels.
 * Includes avatar, title, and action buttons (new chat, settings, pin, close).
 */

import { X, Plus, Pin, PinOff, Settings, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { LucyAvatar } from './lucy-agent';

// ============================================================================
// Types
// ============================================================================

export interface LucyAgentChatHeaderProps {
  /** Whether the panel is pinned (side panel mode) */
  isPinned: boolean;
  /** Whether settings are currently shown */
  showSettings: boolean;
  /** Callback to toggle settings view */
  onToggleSettings: () => void;
  /** Callback to toggle pin/floating mode */
  onToggleMode: () => void;
  /** Callback when new chat is requested */
  onNewChat: () => void;
  /** Callback when close is requested */
  onClose: () => void;
  /** Optional className for additional styling */
  className?: string;
  /** Whether header is a drag handle (for floating panel) */
  isDragHandle?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function LucyAgentChatHeader({
  isPinned,
  showSettings,
  onToggleSettings,
  onToggleMode,
  onNewChat,
  onClose,
  className,
  isDragHandle = false,
}: LucyAgentChatHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-3 py-2 border-b shrink-0',
        isDragHandle && 'cursor-move select-none bg-muted/50',
        isDragHandle && 'drag-handle',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <LucyAvatar size="sm" />
        <span className="font-medium text-sm">Lucy</span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          Beta
        </span>
      </div>
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onNewChat}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New Chat</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7', showSettings && 'bg-accent')}
                onClick={onToggleSettings}
              >
                {showSettings ? (
                  <MessageSquare className="h-3.5 w-3.5" />
                ) : (
                  <Settings className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {showSettings ? 'Back to Chat' : 'Settings'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onToggleMode}
              >
                {isPinned ? (
                  <PinOff className="h-3.5 w-3.5" />
                ) : (
                  <Pin className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isPinned ? 'Unpin (floating mode)' : 'Pin (side panel)'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onClose}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}

export default LucyAgentChatHeader;
