/**
 * AgentPanelWrapper
 *
 * Wrapper component that manages the agent panel rendering.
 *
 * Supports two modes via VITE_AGENT_PANEL_MODE env variable:
 * - 'floating' (default): Draggable, resizable floating panel with integrated toggle button
 * - 'side-panel': Sliding panel triggered from sidebar
 */

import { FloatingAgentPanel } from './FloatingAgentPanel';
import { AgentPanel } from './AgentPanel';
import { useDistriConnection } from '@/providers/DistriProvider';
import { useAgentPanel, PANEL_MODE } from '@/contexts/AgentPanelContext';

export function AgentPanelWrapper() {
  const { isInitializing } = useDistriConnection();
  const { isOpen, toggle, close } = useAgentPanel();

  // Don't render anything if still initializing
  if (isInitializing) {
    return null;
  }

  // Floating mode: FloatingAgentPanel handles both button and panel
  if (PANEL_MODE === 'floating') {
    return (
      <FloatingAgentPanel
        isOpen={isOpen}
        onToggle={toggle}
        onClose={close}
      />
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
