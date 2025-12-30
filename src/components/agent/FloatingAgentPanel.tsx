/**
 * FloatingAgentPanel
 *
 * A floating, draggable, and resizable chat panel for Lucy, the vLLora AI assistant.
 * Uses react-rnd for drag and resize functionality.
 * Only renders when open - the sidebar button handles opening in both modes.
 * Panel bounds (position and size) are persisted to localStorage.
 */

import { useState, useCallback, useRef } from 'react';
import { Rnd } from 'react-rnd';
import { cn } from '@/lib/utils';
import { useAgentChat } from './useAgentChat';
import { AgentChatContent } from './AgentChatContent';
import { PANEL_STORAGE_KEY } from '@/contexts/AgentPanelContext';
import { useDistriConnection } from '@/providers/DistriProvider';

// ============================================================================
// Types
// ============================================================================

interface FloatingAgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
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
const EDGE_PADDING = 16;

const MIN_SIZE = { width: 320, height: 400 };
const MAX_SIZE = { width: 700, height: 850 };

// Get default panel bounds (left side, full height like side panel)
const getDefaultPanelBounds = (): PanelBounds => ({
  x: EDGE_PADDING,
  y: EDGE_PADDING,
  width: DEFAULT_SIZE.width,
  height: typeof window !== 'undefined' ? window.innerHeight - EDGE_PADDING * 2 : DEFAULT_SIZE.height,
});

// Load panel bounds from localStorage
const loadPanelBounds = (): PanelBounds => {
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
  return getDefaultPanelBounds();
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
// Main Component
// ============================================================================

export function FloatingAgentPanel({
  isOpen,
  onClose,
  className,
}: FloatingAgentPanelProps) {
  const { isConnected, reconnect } = useDistriConnection();
  // Use shared agent chat hook
  const {
    agent,
    agentLoading,
    selectedThreadId,
    tools,
    messages,
    handleNewChat,
  } = useAgentChat();

  // Drag/resize state
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const rndRef = useRef<Rnd>(null);

  // Panel bounds state
  const [bounds, setBounds] = useState<PanelBounds>(loadPanelBounds);

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

  // When closed, render nothing - sidebar button handles opening
  if (!isOpen) {
    return null;
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
      style={{ zIndex: 50, ...panelStyle }}
      className={cn(
        'bg-background rounded-lg flex flex-col flex-1',
        (isDragging || isResizing) && 'select-none',
        className
      )}
    >
      <div className="flex flex-col flex-1 h-full rounded-lg overflow-hidden">
        <AgentChatContent
          agent={agent}
          agentLoading={agentLoading}
          isConnected={isConnected}
          onConnected={reconnect}
          threadId={selectedThreadId}
          tools={tools}
          messages={messages}
          onNewChat={handleNewChat}
          onClose={onClose}
          isDragHandle={true}
        />
      </div>
    </Rnd>
  );
}

export default FloatingAgentPanel;
