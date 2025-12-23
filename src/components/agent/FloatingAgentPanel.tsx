/**
 * FloatingAgentPanel
 *
 * A floating, draggable, and resizable chat panel for the vLLora AI assistant.
 * Can be moved anywhere on screen and resized by dragging edges/corners.
 */

import { useState, useMemo, useCallback } from 'react';
import { Chat, useAgent, useChatMessages } from '@distri/react';
import { uuidv4, DistriFnTool } from '@distri/core';
import { X, MessageCircle, Plus, Loader2, Minimize2, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getMainAgentName } from '@/lib/agent-sync';
import { uiTools } from '@/lib/distri-ui-tools';
import { dataTools } from '@/lib/distri-data-tools';
import { useAgentToolListeners } from '@/hooks/useAgentToolListeners';
import {
  useResizableDraggable,
  PanelBounds,
  ResizeDirection,
} from './hooks/useResizableDraggable';

// ============================================================================
// Types
// ============================================================================

interface Position {
  x: number;
  y: number;
}

interface FloatingAgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  /** Position of the toggle button - panel will open near this position */
  buttonPosition?: Position | null;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'vllora:floating-panel-bounds';
const DEFAULT_SIZE = { width: 400, height: 600 };

const getDefaultBounds = (buttonPosition?: Position | null): PanelBounds => {
  if (typeof window === 'undefined') {
    return {
      position: { x: 100, y: 100 },
      size: DEFAULT_SIZE,
    };
  }

  // If button position is provided, position panel relative to button
  if (buttonPosition) {
    // Position panel so its bottom-right corner is near the button
    // This creates a natural "expansion" effect from the button
    const x = Math.max(16, buttonPosition.x - DEFAULT_SIZE.width + 48);
    const y = Math.max(16, buttonPosition.y - DEFAULT_SIZE.height + 48);

    // Ensure panel stays within viewport
    const maxX = window.innerWidth - DEFAULT_SIZE.width - 16;
    const maxY = window.innerHeight - DEFAULT_SIZE.height - 16;

    return {
      position: {
        x: Math.min(x, maxX),
        y: Math.min(y, maxY),
      },
      size: DEFAULT_SIZE,
    };
  }

  // Default: position in bottom-right area
  return {
    position: {
      x: window.innerWidth - 420,
      y: window.innerHeight - 620,
    },
    size: DEFAULT_SIZE,
  };
};

const MIN_SIZE = { width: 320, height: 400 };
const MAX_SIZE = { width: 700, height: 850 };

// ============================================================================
// Thread ID Management
// ============================================================================

function getThreadId(): string {
  const threadId = localStorage.getItem('vllora:agentThreadId');
  if (!threadId) {
    const newThreadId = uuidv4();
    localStorage.setItem('vllora:agentThreadId', newThreadId);
    return newThreadId;
  }
  return threadId;
}

function setThreadId(threadId: string): void {
  localStorage.setItem('vllora:agentThreadId', threadId);
}

// ============================================================================
// Resize Handle Component
// ============================================================================

interface ResizeHandleProps {
  direction: ResizeDirection;
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
}

function ResizeHandle({ direction, onMouseDown, onTouchStart }: ResizeHandleProps) {
  const cursorMap: Record<ResizeDirection, string> = {
    n: 'cursor-ns-resize',
    s: 'cursor-ns-resize',
    e: 'cursor-ew-resize',
    w: 'cursor-ew-resize',
    ne: 'cursor-nesw-resize',
    nw: 'cursor-nwse-resize',
    se: 'cursor-nwse-resize',
    sw: 'cursor-nesw-resize',
  };

  const positionMap: Record<ResizeDirection, string> = {
    n: 'top-0 left-2 right-2 h-2 -translate-y-1',
    s: 'bottom-0 left-2 right-2 h-2 translate-y-1',
    e: 'right-0 top-2 bottom-2 w-2 translate-x-1',
    w: 'left-0 top-2 bottom-2 w-2 -translate-x-1',
    ne: 'top-0 right-0 w-4 h-4 -translate-y-1 translate-x-1',
    nw: 'top-0 left-0 w-4 h-4 -translate-y-1 -translate-x-1',
    se: 'bottom-0 right-0 w-4 h-4 translate-y-1 translate-x-1',
    sw: 'bottom-0 left-0 w-4 h-4 translate-y-1 -translate-x-1',
  };

  return (
    <div
      className={cn(
        'absolute z-10',
        cursorMap[direction],
        positionMap[direction]
      )}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    />
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function FloatingAgentPanel({
  isOpen,
  onClose,
  className,
  buttonPosition,
}: FloatingAgentPanelProps) {
  const agentName = getMainAgentName();
  const { agent, loading: agentLoading } = useAgent({ agentIdOrDef: agentName });
  const [selectedThreadId, setSelectedThreadId] = useState<string>(getThreadId());
  const [isMinimized, setIsMinimized] = useState(false);

  // Calculate default bounds based on button position
  const defaultBounds = useMemo(
    () => getDefaultBounds(buttonPosition),
    [buttonPosition]
  );

  // Resizable and draggable panel
  const {
    bounds,
    isDragging,
    isResizing,
    dragHandlers,
    getResizeHandlers,
  } = useResizableDraggable({
    storageKey: STORAGE_KEY,
    defaultBounds,
    minSize: MIN_SIZE,
    maxSize: MAX_SIZE,
    edgePadding: 16,
  });

  // Listen for agent tool events
  useAgentToolListeners();

  // Combine UI and Data tools
  const tools = useMemo<DistriFnTool[]>(() => {
    const allTools = [...uiTools, ...dataTools];
    console.log('[FloatingAgentPanel] External tools registered:', allTools.map(t => t.name));
    return allTools;
  }, []);

  // Get existing messages for the thread
  const { messages } = useChatMessages({
    agent: agent!,
    threadId: selectedThreadId,
    onError: (error) => {
      console.error('[FloatingAgentPanel] Error fetching messages:', error);
    },
  });

  // Thread management
  const handleNewChat = useCallback(() => {
    const newThreadId = uuidv4();
    setSelectedThreadId(newThreadId);
    setThreadId(newThreadId);
  }, []);

  // Toggle minimize
  const handleToggleMinimize = useCallback(() => {
    setIsMinimized(prev => !prev);
  }, []);

  if (!isOpen) {
    return null;
  }

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    left: bounds.position.x,
    top: bounds.position.y,
    width: bounds.size.width,
    height: isMinimized ? 48 : bounds.size.height,
    zIndex: 50,
  };

  // Resize handles
  const resizeDirections: ResizeDirection[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  return (
    <div
      style={panelStyle}
      className={cn(
        'bg-background border rounded-lg shadow-2xl flex flex-col overflow-hidden',
        (isDragging || isResizing) && 'select-none',
        'transition-[height] duration-200',
        className
      )}
    >
      {/* Resize handles (only when not minimized) */}
      {!isMinimized &&
        resizeDirections.map((dir) => {
          const handlers = getResizeHandlers(dir);
          return (
            <ResizeHandle
              key={dir}
              direction={dir}
              onMouseDown={handlers.onMouseDown}
              onTouchStart={handlers.onTouchStart}
            />
          );
        })}

      {/* Header (drag handle) */}
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2 border-b bg-muted/50',
          'cursor-move select-none shrink-0'
        )}
        {...dragHandlers}
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">vLLora Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleNewChat}
            title="New Chat"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleToggleMinimize}
            title={isMinimized ? 'Maximize' : 'Minimize'}
          >
            {isMinimized ? (
              <Maximize2 className="h-3.5 w-3.5" />
            ) : (
              <Minimize2 className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content (hidden when minimized) */}
      {!isMinimized && (
        <div className="flex-1 overflow-hidden">
          {agentLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm text-muted-foreground">
                  Loading assistant...
                </span>
              </div>
            </div>
          ) : !agent ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">Agent Not Available</h3>
              <p className="text-sm text-muted-foreground">
                The Distri backend server may not be running.
              </p>
            </div>
          ) : (
            <Chat
              threadId={selectedThreadId}
              agent={agent}
              externalTools={tools}
              initialMessages={messages}
              theme="dark"
            />
          )}
        </div>
      )}
    </div>
  );
}

export default FloatingAgentPanel;
