/**
 * FloatingAgentPanel
 *
 * A floating, draggable, and resizable chat panel for the vLLora AI assistant.
 * Includes an integrated toggle button that shares the same drag behavior.
 * Can be moved anywhere on screen and resized by dragging edges/corners.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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
import { useDraggable } from './hooks/useDraggable';

// ============================================================================
// Types
// ============================================================================

interface FloatingAgentPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SIZE = { width: 400, height: 600 };
const BUTTON_SIZE = 48;
const EDGE_PADDING = 16;

// Get default button position (bottom-right corner)
const getDefaultButtonPosition = () => ({
  x: typeof window !== 'undefined' ? window.innerWidth - BUTTON_SIZE - EDGE_PADDING : 100,
  y: typeof window !== 'undefined' ? window.innerHeight - BUTTON_SIZE - EDGE_PADDING : 100,
});

// Calculate panel bounds from button position
const getPanelBoundsFromButton = (buttonX: number, buttonY: number): PanelBounds => {
  if (typeof window === 'undefined') {
    return {
      position: { x: 100, y: 100 },
      size: DEFAULT_SIZE,
    };
  }

  // Position panel so its bottom-right corner is near the button
  let x = buttonX - DEFAULT_SIZE.width + BUTTON_SIZE;
  let y = buttonY - DEFAULT_SIZE.height + BUTTON_SIZE;

  // Ensure panel stays within viewport
  const maxX = window.innerWidth - DEFAULT_SIZE.width - EDGE_PADDING;
  const maxY = window.innerHeight - DEFAULT_SIZE.height - EDGE_PADDING;

  x = Math.max(EDGE_PADDING, Math.min(x, maxX));
  y = Math.max(EDGE_PADDING, Math.min(y, maxY));

  return {
    position: { x, y },
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
  onToggle,
  onClose,
  className,
}: FloatingAgentPanelProps) {
  const agentName = getMainAgentName();
  const { agent, loading: agentLoading } = useAgent({ agentIdOrDef: agentName });
  const [selectedThreadId, setSelectedThreadId] = useState<string>(getThreadId());
  const [isMinimized, setIsMinimized] = useState(false);

  // Button uses useDraggable - can go anywhere freely
  const {
    position: buttonPosition,
    isDragging: isButtonDragging,
    wasDragged,
    handlers: buttonHandlers,
  } = useDraggable({
    storageKey: 'vllora:agent-button-position',
    defaultPosition: getDefaultButtonPosition(),
    snapToEdge: false,
    edgePadding: EDGE_PADDING,
    dragThreshold: 5,
    elementSize: { width: BUTTON_SIZE, height: BUTTON_SIZE },
  });

  // Calculate panel default bounds from button position
  const defaultBounds = useMemo(
    () => getPanelBoundsFromButton(buttonPosition.x, buttonPosition.y),
    [buttonPosition]
  );

  // Panel uses useResizableDraggable - constrained by size
  const {
    bounds,
    isDragging: isPanelDragging,
    isResizing,
    dragHandlers: panelDragHandlers,
    getResizeHandlers,
    resetBounds,
  } = useResizableDraggable({
    storageKey: 'vllora:agent-panel-bounds',
    defaultBounds,
    minSize: MIN_SIZE,
    maxSize: MAX_SIZE,
    edgePadding: EDGE_PADDING,
  });

  // Reset panel bounds when opening (position relative to button)
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      // Panel just opened - reset bounds to be near button
      resetBounds();
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, resetBounds]);

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

  // Handle button click - only toggle if we didn't drag
  const handleButtonClick = useCallback(() => {
    if (!wasDragged) {
      onToggle();
    }
  }, [onToggle, wasDragged]);

  // When closed, render just the toggle button
  if (!isOpen) {
    const buttonStyle: React.CSSProperties = {
      position: 'fixed',
      left: buttonPosition.x,
      top: buttonPosition.y,
      zIndex: 50,
      transition: isButtonDragging ? 'none' : 'left 150ms ease-out, top 150ms ease-out',
    };

    return (
      <Button
        variant="default"
        size="icon"
        onClick={handleButtonClick}
        onMouseDown={buttonHandlers.onMouseDown}
        onTouchStart={buttonHandlers.onTouchStart}
        style={buttonStyle}
        className={cn(
          'h-12 w-12 rounded-full shadow-lg',
          !isButtonDragging && 'hover:scale-105 active:scale-95',
          isButtonDragging && 'scale-110 shadow-2xl cursor-grabbing',
          !isButtonDragging && 'cursor-grab',
          className
        )}
        aria-label="Open AI Assistant"
      >
        <MessageCircle className="h-5 w-5" />
      </Button>
    );
  }

  // When open, render the full panel
  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    left: bounds.position.x,
    top: bounds.position.y,
    width: bounds.size.width,
    height: isMinimized ? 48 : bounds.size.height,
    zIndex: 50,
    border: '1px solid rgba(var(--theme-500), 0.3)',
    boxShadow: `
      0 0 20px rgba(var(--theme-500), 0.1),
      0 0 40px rgba(var(--theme-500), 0.05),
      0 25px 50px -12px rgba(0, 0, 0, 0.25)
    `,
  };

  // Resize handles
  const resizeDirections: ResizeDirection[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  return (
    <div
      style={panelStyle}
      className={cn(
        'bg-background rounded-lg flex flex-col overflow-hidden',
        (isPanelDragging || isResizing) && 'select-none',
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
        {...panelDragHandlers}
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
