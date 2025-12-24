/**
 * FloatingAgentPanel
 *
 * A floating, draggable, and resizable chat panel for the vLLora AI assistant.
 * Uses react-rnd for drag and resize functionality.
 * Includes an integrated toggle button with drag behavior.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { Chat, useAgent, useChatMessages } from '@distri/react';
import { uuidv4, DistriFnTool } from '@distri/core';
import { X, MessageCircle, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getMainAgentName } from '@/lib/agent-sync';
import { uiTools } from '@/lib/distri-ui-tools';
import { dataTools } from '@/lib/distri-data-tools';
import { useAgentToolListeners } from '@/hooks/useAgentToolListeners';

// ============================================================================
// Types
// ============================================================================

interface FloatingAgentPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  className?: string;
}

interface Position {
  x: number;
  y: number;
}

interface PanelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SIZE = { width: 400, height: 600 };
const BUTTON_SIZE = 48;
const EDGE_PADDING = 16;
const PANEL_STORAGE_KEY = 'vllora:agent-panel-bounds';
const BUTTON_STORAGE_KEY = 'vllora:agent-button-position';

const MIN_SIZE = { width: 320, height: 400 };
const MAX_SIZE = { width: 700, height: 850 };

// Get default button position (bottom-right corner)
const getDefaultButtonPosition = (): Position => ({
  x: typeof window !== 'undefined' ? window.innerWidth - BUTTON_SIZE - EDGE_PADDING : 100,
  y: typeof window !== 'undefined' ? window.innerHeight - BUTTON_SIZE - EDGE_PADDING : 100,
});

// Load button position from localStorage
const loadButtonPosition = (): Position => {
  try {
    const stored = localStorage.getItem(BUTTON_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate position is within viewport
      const maxX = window.innerWidth - BUTTON_SIZE - EDGE_PADDING;
      const maxY = window.innerHeight - BUTTON_SIZE - EDGE_PADDING;
      return {
        x: Math.max(EDGE_PADDING, Math.min(parsed.x, maxX)),
        y: Math.max(EDGE_PADDING, Math.min(parsed.y, maxY)),
      };
    }
  } catch {
    // Ignore storage errors
  }
  return getDefaultButtonPosition();
};

// Save button position to localStorage
const saveButtonPosition = (position: Position) => {
  try {
    localStorage.setItem(BUTTON_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Ignore storage errors
  }
};

// Calculate panel bounds from button position
const getPanelBoundsFromButton = (buttonX: number, buttonY: number): PanelBounds => {
  if (typeof window === 'undefined') {
    return { x: 100, y: 100, ...DEFAULT_SIZE };
  }

  // Position panel so its bottom-right corner is near the button
  let x = buttonX - DEFAULT_SIZE.width + BUTTON_SIZE;
  let y = buttonY - DEFAULT_SIZE.height + BUTTON_SIZE;

  // Ensure panel stays within viewport
  const maxX = window.innerWidth - DEFAULT_SIZE.width - EDGE_PADDING;
  const maxY = window.innerHeight - DEFAULT_SIZE.height - EDGE_PADDING;

  x = Math.max(EDGE_PADDING, Math.min(x, maxX));
  y = Math.max(EDGE_PADDING, Math.min(y, maxY));

  return { x, y, ...DEFAULT_SIZE };
};

// Load panel bounds from localStorage
const loadPanelBounds = (buttonX: number, buttonY: number): PanelBounds => {
  try {
    const stored = localStorage.getItem(PANEL_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate bounds are within viewport
      const maxX = window.innerWidth - parsed.width - EDGE_PADDING;
      const maxY = window.innerHeight - parsed.height - EDGE_PADDING;
      return {
        x: Math.max(EDGE_PADDING, Math.min(parsed.x, maxX)),
        y: Math.max(EDGE_PADDING, Math.min(parsed.y, maxY)),
        width: Math.max(MIN_SIZE.width, Math.min(parsed.width, MAX_SIZE.width)),
        height: Math.max(MIN_SIZE.height, Math.min(parsed.height, MAX_SIZE.height)),
      };
    }
  } catch {
    // Ignore storage errors
  }
  return getPanelBoundsFromButton(buttonX, buttonY);
};

// Save panel bounds to localStorage
const savePanelBounds = (bounds: PanelBounds) => {
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(bounds));
  } catch {
    // Ignore storage errors
  }
};

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
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isButtonDragging, setIsButtonDragging] = useState(false);
  const buttonDraggedRef = useRef(false);
  const rndRef = useRef<Rnd>(null);
  const buttonRndRef = useRef<Rnd>(null);

  // Button position state
  const [buttonPosition, setButtonPosition] = useState<Position>(loadButtonPosition);

  // Panel bounds state
  const [bounds, setBounds] = useState<PanelBounds>(() =>
    loadPanelBounds(buttonPosition.x, buttonPosition.y)
  );

  // Reset panel position when opening (position relative to button)
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      const newBounds = getPanelBoundsFromButton(buttonPosition.x, buttonPosition.y);
      setBounds(newBounds);
      // Update Rnd position
      if (rndRef.current) {
        rndRef.current.updatePosition({ x: newBounds.x, y: newBounds.y });
        rndRef.current.updateSize({ width: newBounds.width, height: newBounds.height });
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, buttonPosition.x, buttonPosition.y]);

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

  // Handle button click - only toggle if we didn't drag
  const handleButtonClick = useCallback(() => {
    if (!buttonDraggedRef.current) {
      onToggle();
    }
    // Reset the flag after click handling
    buttonDraggedRef.current = false;
  }, [onToggle]);

  // Handle button drag events
  const handleButtonDragStart = useCallback(() => {
    setIsButtonDragging(true);
    buttonDraggedRef.current = false;
  }, []);

  const handleButtonDragStop = useCallback((_e: any, d: { x: number; y: number }) => {
    setIsButtonDragging(false);
    const newPosition = { x: d.x, y: d.y };

    // Check if actually moved
    if (d.x !== buttonPosition.x || d.y !== buttonPosition.y) {
      buttonDraggedRef.current = true;
      setButtonPosition(newPosition);
      saveButtonPosition(newPosition);
    }
  }, [buttonPosition]);

  // Handle panel drag/resize events
  const handleDragStop = useCallback((_e: any, d: { x: number; y: number }) => {
    setIsDragging(false);
    const newBounds = { ...bounds, x: d.x, y: d.y };
    setBounds(newBounds);
    savePanelBounds(newBounds);
  }, [bounds]);

  const handleResizeStop = useCallback(
    (_e: any, _dir: any, ref: HTMLElement, _delta: any, position: { x: number; y: number }) => {
      setIsResizing(false);
      const newBounds = {
        x: position.x,
        y: position.y,
        width: parseInt(ref.style.width, 10),
        height: parseInt(ref.style.height, 10),
      };
      setBounds(newBounds);
      savePanelBounds(newBounds);
    },
    []
  );

  // When closed, render just the toggle button
  if (!isOpen) {
    return (
      <Rnd
        key={`button-${buttonPosition.x}-${buttonPosition.y}`}
        ref={buttonRndRef}
        default={{
          x: buttonPosition.x,
          y: buttonPosition.y,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
        }}
        bounds="window"
        enableResizing={false}
        onDragStart={handleButtonDragStart}
        onDragStop={handleButtonDragStop}
        style={{ zIndex: 50 }}
        className="rounded-full"
      >
        <Button
          variant="default"
          size="icon"
          onClick={handleButtonClick}
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
      </Rnd>
    );
  }

  // Panel styling
  const panelStyle: React.CSSProperties = {
    border: '1px solid rgba(var(--theme-500), 0.3)',
    boxShadow: `
      0 0 20px rgba(var(--theme-500), 0.1),
      0 0 40px rgba(var(--theme-500), 0.05),
      0 25px 50px -12px rgba(0, 0, 0, 0.25)
    `,
  };

  return (
    <Rnd
      key={`panel-${bounds.x}-${bounds.y}`}
      ref={rndRef}
      default={{
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }}
      size={{
        width: bounds.width,
        height: bounds.height,
      }}
      minWidth={MIN_SIZE.width}
      minHeight={MIN_SIZE.height}
      maxWidth={MAX_SIZE.width}
      maxHeight={MAX_SIZE.height}
      bounds="window"
      dragHandleClassName="drag-handle"
      enableResizing={true}
      onDragStart={() => setIsDragging(true)}
      onDragStop={handleDragStop}
      onResizeStart={() => setIsResizing(true)}
      onResizeStop={handleResizeStop}
      style={{ zIndex: 50 }}
      className={cn(
        'bg-background rounded-lg flex flex-col overflow-hidden',
        (isDragging || isResizing) && 'select-none',
        className
      )}
    >
      <div style={panelStyle} className="flex flex-col h-full rounded-lg overflow-hidden">
        {/* Header (drag handle) */}
        <div
          className={cn(
            'drag-handle flex items-center justify-between px-3 py-2 border-b bg-muted/50',
            'cursor-move select-none shrink-0'
          )}
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
              onClick={onClose}
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Content */}
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
      </div>
    </Rnd>
  );
}

export default FloatingAgentPanel;
