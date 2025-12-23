/**
 * AgentPanelWrapper
 *
 * Wrapper component that manages the agent panel open/close state
 * and renders both the toggle button and the panel.
 * The toggle button is draggable with edge snapping.
 */

import { useState, useCallback } from 'react';
import { AgentPanel } from './AgentPanel';
import { AgentToggleButton } from './AgentToggleButton';
import { useDraggable } from './hooks/useDraggable';
import { useDistriConnection } from '@/providers/DistriProvider';

// Default position: bottom-right corner
const getDefaultPosition = () => ({
  x: typeof window !== 'undefined' ? window.innerWidth - 64 : 0,
  y: typeof window !== 'undefined' ? window.innerHeight - 80 : 0,
});

export function AgentPanelWrapper() {
  const [isOpen, setIsOpen] = useState(false);
  const { isInitializing } = useDistriConnection();

  // Draggable button with edge snapping and persistence
  const { position, isDragging, isOnLeftSide, handlers } = useDraggable({
    storageKey: 'vllora:agent-button-position',
    defaultPosition: getDefaultPosition(),
    snapToEdge: true,
    edgePadding: 16,
    dragThreshold: 5,
    elementSize: { width: 48, height: 48 },
  });

  const handleToggle = useCallback(() => {
    // Only toggle if not currently dragging
    if (!isDragging) {
      setIsOpen(prev => !prev);
    }
  }, [isDragging]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Don't render anything if still initializing
  if (isInitializing) {
    return null;
  }

  // Show toggle button even if not connected (user can see error state in panel)
  return (
    <>
      <AgentToggleButton
        isOpen={isOpen}
        onClick={handleToggle}
        hasUnread={false}
        position={position}
        isDragging={isDragging}
        onMouseDown={handlers.onMouseDown}
        onTouchStart={handlers.onTouchStart}
      />
      <AgentPanel
        isOpen={isOpen}
        onClose={handleClose}
        side={isOnLeftSide ? 'right' : 'left'}
      />
    </>
  );
}

export default AgentPanelWrapper;
