/**
 * AgentPanelWrapper
 *
 * Wrapper component that manages the agent panel rendering.
 *
 * Supports two modes via VITE_AGENT_PANEL_MODE env variable:
 * - 'floating' (default): Draggable, resizable floating panel with floating toggle button
 * - 'side-panel': Sliding panel triggered from sidebar
 */

import { useCallback } from 'react';
import { FloatingAgentPanel } from './FloatingAgentPanel';
import { AgentPanel } from './AgentPanel';
import { AgentToggleButton } from './AgentToggleButton';
import { useDraggable } from './hooks/useDraggable';
import { useDistriConnection } from '@/providers/DistriProvider';
import { useAgentPanel, PANEL_MODE } from '@/contexts/AgentPanelContext';

// Default position: bottom-right corner
const getDefaultPosition = () => ({
  x: typeof window !== 'undefined' ? window.innerWidth - 64 : 0,
  y: typeof window !== 'undefined' ? window.innerHeight - 80 : 0,
});

export function AgentPanelWrapper() {
  const { isInitializing } = useDistriConnection();
  const { isOpen, toggle, close } = useAgentPanel();

  // Draggable button with edge snapping and persistence (for floating mode)
  const { position, isDragging, wasDragged, handlers } = useDraggable({
    storageKey: 'vllora:agent-button-position',
    defaultPosition: getDefaultPosition(),
    snapToEdge: true,
    edgePadding: 16,
    dragThreshold: 5,
    elementSize: { width: 48, height: 48 },
  });

  const handleToggle = useCallback(() => {
    // Only toggle if we didn't just finish dragging
    if (!wasDragged) {
      toggle();
    }
  }, [wasDragged, toggle]);

  // Don't render anything if still initializing
  if (isInitializing) {
    return null;
  }

  // Floating mode: show toggle button (hidden when panel is open) and floating panel
  if (PANEL_MODE === 'floating') {
    return (
      <>
        {!isOpen && (
          <AgentToggleButton
            isOpen={isOpen}
            onClick={handleToggle}
            hasUnread={false}
            position={position}
            isDragging={isDragging}
            onMouseDown={handlers.onMouseDown}
            onTouchStart={handlers.onTouchStart}
          />
        )}
        <FloatingAgentPanel
          isOpen={isOpen}
          onClose={close}
          buttonPosition={position}
        />
      </>
    );
  }

  // Side panel mode: panel opens from left (next to sidebar)
  return (
    <AgentPanel
      isOpen={isOpen}
      onClose={close}
      side="left"
    />
  );
}

export default AgentPanelWrapper;
