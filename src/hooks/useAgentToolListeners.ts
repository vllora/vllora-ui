/**
 * Hook to listen for Distri agent tool events and respond with UI state
 *
 * This hook bridges the gap between the agent's external tools and the UI.
 * When an agent calls get_current_view, get_selection_context, etc.,
 * this hook listens for the request events and responds with the appropriate data.
 */

import { useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { emitter } from '@/utils/eventEmitter';

interface UseAgentToolListenersOptions {
  selectedRunId?: string | null;
  selectedSpanId?: string | null;
  detailSpanId?: string | null;
  collapsedSpanIds?: string[];
  runs?: Array<{
    run_id: string;
    status: string;
    model: string | null;
    duration_ms: number | null;
  }>;
}

export function useAgentToolListeners(options: UseAgentToolListenersOptions = {}) {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const {
    selectedRunId = null,
    selectedSpanId = null,
    detailSpanId = null,
    collapsedSpanIds = [],
    runs = [],
  } = options;

  useEffect(() => {
    // Handler for get_current_view
    const handleGetCurrentView = () => {
      const page = location.pathname.split('/')[1] || 'home';
      const projectId = searchParams.get('project_id') || searchParams.get('projectId');
      const threadId = searchParams.get('thread_id') || searchParams.get('threadId');
      const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';

      emitter.emit('vllora_current_view_response', {
        page,
        projectId,
        threadId,
        theme,
        modal: null, // TODO: integrate with ModalContext
      });
    };

    // Handler for get_selection_context
    const handleGetSelectionContext = () => {
      const textSelection = window.getSelection()?.toString() || null;

      emitter.emit('vllora_selection_context_response', {
        selectedRunId,
        selectedSpanId,
        detailSpanId,
        textSelection,
      });
    };

    // Handler for get_thread_runs
    const handleGetThreadRuns = () => {
      emitter.emit('vllora_thread_runs_response', {
        runs,
      });
    };

    // Handler for get_collapsed_spans
    const handleGetCollapsedSpans = () => {
      emitter.emit('vllora_collapsed_spans_response', {
        collapsedSpanIds,
      });
    };

    // Register event listeners
    emitter.on('vllora_get_current_view', handleGetCurrentView);
    emitter.on('vllora_get_selection_context', handleGetSelectionContext);
    emitter.on('vllora_get_thread_runs', handleGetThreadRuns);
    emitter.on('vllora_get_collapsed_spans', handleGetCollapsedSpans);

    // Cleanup
    return () => {
      emitter.off('vllora_get_current_view', handleGetCurrentView);
      emitter.off('vllora_get_selection_context', handleGetSelectionContext);
      emitter.off('vllora_get_thread_runs', handleGetThreadRuns);
      emitter.off('vllora_get_collapsed_spans', handleGetCollapsedSpans);
    };
  }, [location, searchParams, selectedRunId, selectedSpanId, detailSpanId, collapsedSpanIds, runs]);
}
