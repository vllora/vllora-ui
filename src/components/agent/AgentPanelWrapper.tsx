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
import { useNavigate, useLocation } from 'react-router';
import { FloatingAgentPanel } from './FloatingAgentPanel';
import { AgentPanel } from './AgentPanel';
import { useDistriConnection } from '@/providers/DistriProvider';
import { useAgentPanel } from '@/contexts/AgentPanelContext';
import { emitter } from '@/utils/eventEmitter';

const isLucyEnabled = import.meta.env.VITE_LUCY_ENABLED === 'true';

export function AgentPanelWrapper() {
  const { isInitializing } = useDistriConnection();
  const { isOpen, close, mode } = useAgentPanel();
  const navigate = useNavigate();
  const location = useLocation();

  // Listen for navigation events from agent tools
  useEffect(() => {
    const handleNavigateTo = ({ url }: { url: string }) => {
      // Use React Router navigate to avoid full page refresh
      // This keeps the agent panel mounted and conversation continues
      navigate(url);
    };

    const handleNavigateToExperiment = ({ url }: { spanId: string; url: string }) => {
      // Use React Router navigate to avoid full page refresh
      // This keeps the agent panel mounted and conversation continues
      navigate(url);
    };

    emitter.on('vllora_navigate_to', handleNavigateTo);
    emitter.on('vllora_navigate_to_experiment', handleNavigateToExperiment);
    return () => {
      emitter.off('vllora_navigate_to', handleNavigateTo);
      emitter.off('vllora_navigate_to_experiment', handleNavigateToExperiment);
    };
  }, [navigate]);

  // Don't render if Lucy is disabled or still initializing
  if (!isLucyEnabled || isInitializing) {
    return null;
  }

  // Don't render on datasets page - it has its own embedded Lucy
  if (location.pathname.startsWith('/datasets')) {
    return null;
  }

  // Floating mode: panel only renders when open, sidebar button handles toggle
  if (mode === 'floating') {
    return (
      <FloatingAgentPanel
        isOpen={isOpen}
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
