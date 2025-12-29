/**
 * AgentPanelWrapper
 *
 * Wrapper component that manages the agent panel rendering.
 *
 * Supports two modes that can be toggled dynamically:
 * - 'side-panel' (default): Sliding panel triggered from sidebar (pinned)
 * - 'floating': Draggable, resizable floating panel (unpinned)
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { FloatingAgentPanel } from './FloatingAgentPanel';
import { AgentPanel } from './AgentPanel';
import { useDistriConnection } from '@/providers/DistriProvider';
import { useAgentPanel } from '@/contexts/AgentPanelContext';
import { emitter } from '@/utils/eventEmitter';

export function AgentPanelWrapper() {
  const { isInitializing } = useDistriConnection();
  const { isOpen, toggle, close, mode } = useAgentPanel();
  const navigate = useNavigate();

  // Listen for navigation events from agent tools
  useEffect(() => {
    const handleNavigateToExperiment = ({ url }: { spanId: string; url: string }) => {
      // Use React Router navigate to avoid full page refresh
      // This keeps the agent panel mounted and conversation continues
      navigate(url);
    };

    emitter.on('vllora_navigate_to_experiment', handleNavigateToExperiment);
    return () => {
      emitter.off('vllora_navigate_to_experiment', handleNavigateToExperiment);
    };
  }, [navigate]);

  // Don't render anything if still initializing
  if (isInitializing) {
    return null;
  }

  // Floating mode: FloatingAgentPanel handles both button and panel
  if (mode === 'floating') {
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
