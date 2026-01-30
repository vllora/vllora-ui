/**
 * useFineTuneAgentChat Hook
 *
 * Specialized hook for finetune agent chat functionality.
 * Uses the vllora_finetune_agent with workflow-aware tools.
 *
 * Key features:
 * - Automatically injects workflow context into messages
 * - Persists workflow state in IndexedDB
 * - Supports resuming workflows across sessions
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAgent, useChatMessages } from '@distri/react';
import { uuidv4, DistriFnTool, DistriMessage, DistriClient } from '@distri/core';
import { finetuneTools, workflowToContext } from '@/lib/distri-finetune-tools';
import { finetuneWorkflowService, FinetuneWorkflowState } from '@/services/finetune-workflow-db';
import { getDatasetById } from '@/services/datasets-db';

// Type for chat messages returned by useChatMessages
// This is a union type that includes DistriMessage and other event types
type ChatMessage = ReturnType<typeof useChatMessages>['messages'][number];

// ============================================================================
// Constants
// ============================================================================

const FINETUNE_AGENT_NAME = 'vllora_finetune_agent';
const THREAD_STORAGE_KEY = 'vllora:finetuneAgentThreadId';

// ============================================================================
// Thread ID Management
// ============================================================================

function getStoredThreadId(datasetId: string): string | null {
  return localStorage.getItem(`${THREAD_STORAGE_KEY}:${datasetId}`);
}

function setStoredThreadId(datasetId: string, threadId: string): void {
  localStorage.setItem(`${THREAD_STORAGE_KEY}:${datasetId}`, threadId);
}

function createNewThreadId(): string {
  return uuidv4();
}

// ============================================================================
// Context Builder
// ============================================================================

function buildContextMessage(
  datasetId: string,
  workflow: FinetuneWorkflowState | null,
  datasetHasEvaluator?: boolean
): string {
  const context = workflowToContext(datasetId, workflow, datasetHasEvaluator);
  return `Context:\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;
}

// ============================================================================
// Hook Options
// ============================================================================

interface UseFineTuneAgentChatOptions {
  /** The dataset ID being processed */
  datasetId: string;
  /** The dataset name for display */
  datasetName?: string;
  /** Training goals (used for workflow initialization) */
  trainingGoals?: string;
}

// ============================================================================
// Hook Return Type
// ============================================================================

interface UseFineTuneAgentChatReturn {
  /** The agent instance */
  agent: any;
  /** Whether the agent is loading */
  agentLoading: boolean;
  /** Current thread ID */
  threadId: string;
  /** Tools available to the agent */
  tools: DistriFnTool[];
  /** Chat messages */
  messages: ChatMessage[];
  /** Current workflow state (null if none) */
  workflow: FinetuneWorkflowState | null;
  /** Whether workflow is loading */
  workflowLoading: boolean;
  /** Create new chat thread */
  handleNewChat: () => void;
  /** Refresh workflow state from IndexedDB */
  refreshWorkflow: () => Promise<void>;
  /** Prepare message with context injection */
  prepareMessage: (userMessage: string) => DistriMessage;
}

// ============================================================================
// Hook
// ============================================================================

export function useFineTuneAgentChat(
  options: UseFineTuneAgentChatOptions
): UseFineTuneAgentChatReturn {
  const { datasetId } = options;

  // Agent state
  const { agent, loading: agentLoading } = useAgent({
    agentIdOrDef: FINETUNE_AGENT_NAME,
  });

  // Thread state - per dataset
  const [threadId, setThreadId] = useState<string>(() => {
    const stored = getStoredThreadId(datasetId);
    if (stored) return stored;
    const newId = createNewThreadId();
    setStoredThreadId(datasetId, newId);
    return newId;
  });

  // Workflow state
  const [workflow, setWorkflow] = useState<FinetuneWorkflowState | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  // Track if dataset has evaluator configured (via UI, separate from workflow)
  const [datasetHasEvaluator, setDatasetHasEvaluator] = useState(false);

  // Tools
  const tools = useMemo<DistriFnTool[]>(() => finetuneTools, []);

  // Chat messages
  const { messages } = useChatMessages({
    agent: agent!,
    threadId,
    onError: (error: any) => {
      console.error('[useFineTuneAgentChat] Error fetching messages:', error);
    },
  });

  // Load workflow state on mount and when datasetId changes
  const refreshWorkflow = useCallback(async () => {
    setWorkflowLoading(true);
    try {
      const [workflowState, dataset] = await Promise.all([
        finetuneWorkflowService.getWorkflowByDataset(datasetId),
        getDatasetById(datasetId),
      ]);
      setWorkflow(workflowState);
      setDatasetHasEvaluator(!!dataset?.evaluationConfig);
    } catch (error) {
      console.error('[useFineTuneAgentChat] Error loading workflow:', error);
      setWorkflow(null);
      setDatasetHasEvaluator(false);
    } finally {
      setWorkflowLoading(false);
    }
  }, [datasetId]);

  // Initial load
  useEffect(() => {
    refreshWorkflow();
  }, [refreshWorkflow]);

  // Update thread ID when dataset changes
  useEffect(() => {
    const stored = getStoredThreadId(datasetId);
    if (stored) {
      setThreadId(stored);
    } else {
      const newId = createNewThreadId();
      setStoredThreadId(datasetId, newId);
      setThreadId(newId);
    }
  }, [datasetId]);

  // Create new chat thread
  const handleNewChat = useCallback(() => {
    const newThreadId = createNewThreadId();
    setStoredThreadId(datasetId, newThreadId);
    setThreadId(newThreadId);
  }, [datasetId]);

  // Prepare message with context injection
  const prepareMessage = useCallback(
    (userMessage: string): DistriMessage => {
      // Build context from current workflow state
      const contextText = buildContextMessage(datasetId, workflow, datasetHasEvaluator);

      // Create message with context prepended
      const fullMessage = `${contextText}\n\nUser message: ${userMessage}`;

      return DistriClient.initDistriMessage('user', [
        { part_type: 'text', data: fullMessage },
      ]);
    },
    [datasetId, workflow, datasetHasEvaluator]
  );

  return {
    agent,
    agentLoading,
    threadId,
    tools,
    messages,
    workflow,
    workflowLoading,
    handleNewChat,
    refreshWorkflow,
    prepareMessage,
  };
}

// ============================================================================
// Helper Hook: Track Workflow Updates
// ============================================================================

/**
 * Hook to subscribe to workflow changes via polling
 * (IndexedDB doesn't have built-in change notifications)
 */
export function useWorkflowPolling(
  datasetId: string,
  enabled: boolean = true,
  intervalMs: number = 2000
) {
  const [workflow, setWorkflow] = useState<FinetuneWorkflowState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;

    const poll = async () => {
      try {
        const state = await finetuneWorkflowService.getWorkflowByDataset(datasetId);
        if (mounted) {
          setWorkflow(state);
          setLoading(false);
        }
      } catch (error) {
        console.error('[useWorkflowPolling] Error:', error);
      }
    };

    // Initial load
    poll();

    // Poll for updates
    const interval = setInterval(poll, intervalMs);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [datasetId, enabled, intervalMs]);

  return { workflow, loading };
}
