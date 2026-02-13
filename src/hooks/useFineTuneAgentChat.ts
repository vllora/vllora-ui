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
import { useAgent, useChatMessages, createAskFollowUpTool } from '@distri/react';
import type { DistriAnyTool } from '@distri/react';
import { uuidv4, DistriMessage, DistriClient } from '@distri/core';
import { finetuneTools, workflowToContext } from '@/lib/distri-finetune-tools';
import type { PlanStatus } from '@/lib/distri-finetune-tools/steps/proposed-plan-store';
import { stockfishTools, isChessDataset } from '@/lib/distri-finetune-tools/steps';
import { finetuneWorkflowService, FinetuneWorkflowState } from '@/services/finetune-workflow-db';
import { getDatasetById } from '@/services/datasets-db';
import { emitter } from '@/utils/eventEmitter';

// Type for chat messages returned by useChatMessages
// This is a union type that includes DistriMessage and other event types
type ChatMessage = ReturnType<typeof useChatMessages>['messages'][number];

// ============================================================================
// Constants
// ============================================================================

const FINETUNE_AGENT_NAME = 'vllora_finetune_agent';

// ============================================================================
// Thread ID Management
// ============================================================================

function createNewThreadId(): string {
  return uuidv4();
}

// ============================================================================
// Context Builder
// ============================================================================

function buildContextMessage(
  datasetId: string,
  workflow: FinetuneWorkflowState | null,
  datasetHasEvaluator?: boolean,
  planStatus?: PlanStatus | null,
): string {
  const context = workflowToContext(datasetId, workflow, datasetHasEvaluator, planStatus);
  // Put dataset_id prominently at the top to help LLM copy it exactly
  // UUIDs are hard for LLMs to transcribe from JSON - make it explicit
  return `DATASET_ID: ${datasetId}\n\nContext:\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;
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
  /** Current plan status (from SetupPlanContext) */
  planStatus?: PlanStatus | null;
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
  tools: DistriAnyTool[];
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
  /** Prepare message with context injection (supports additional parts like files) */
  prepareMessage: (userMessage: string, additionalParts?: any[]) => DistriMessage;
}

// ============================================================================
// Hook
// ============================================================================

export function useFineTuneAgentChat(
  options: UseFineTuneAgentChatOptions
): UseFineTuneAgentChatReturn {
  const { datasetId, trainingGoals, planStatus } = options;

  // Agent state
  const { agent, loading: agentLoading } = useAgent({
    agentIdOrDef: FINETUNE_AGENT_NAME,
  });

  // Thread state - always start fresh per dataset visit
  const [threadId, setThreadId] = useState<string>(() => createNewThreadId());

  // Workflow state
  const [workflow, setWorkflow] = useState<FinetuneWorkflowState | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  // Track if dataset has eval script configured (via UI, separate from workflow)
  const [datasetHasEvalScript, setDatasetHasEvalScript] = useState(false);

  // Check if this is a chess-related dataset (enables Stockfish tools)
  const isChess = useMemo(() => isChessDataset(trainingGoals), [trainingGoals]);

  // Tools - includes finetune tools + UI tools (ask_follow_up)
  // Conditionally includes Stockfish tools for chess datasets
  const tools = useMemo<DistriAnyTool[]>(
    () => [
      ...finetuneTools,
      ...(isChess ? stockfishTools : []),
      createAskFollowUpTool(),
    ],
    [isChess]
  );

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
    // Skip loading if no datasetId
    if (!datasetId) {
      setWorkflowLoading(false);
      setWorkflow(null);
      setDatasetHasEvalScript(false);
      return;
    }

    setWorkflowLoading(true);
    try {
      const [workflowState, dataset] = await Promise.all([
        finetuneWorkflowService.getWorkflowByDataset(datasetId),
        getDatasetById(datasetId),
      ]);
      setWorkflow(workflowState);
      setDatasetHasEvalScript(!!dataset?.evalScript);
    } catch (error) {
      console.error('[useFineTuneAgentChat] Error loading workflow:', error);
      setWorkflow(null);
      setDatasetHasEvalScript(false);
    } finally {
      setWorkflowLoading(false);
    }
  }, [datasetId]);

  // Initial load
  useEffect(() => {
    refreshWorkflow();
  }, [refreshWorkflow]);

  // Listen for workflow updated events (e.g., after execute_setup_plan completes)
  useEffect(() => {
    const handleWorkflowUpdated = ({ datasetId: updatedDatasetId }: { datasetId: string }) => {
      if (updatedDatasetId === datasetId) {
        console.log('[useFineTuneAgentChat] Workflow updated event received, refreshing...');
        refreshWorkflow();
      }
    };

    emitter.on('vllora_workflow_updated', handleWorkflowUpdated);
    return () => {
      emitter.off('vllora_workflow_updated', handleWorkflowUpdated);
    };
  }, [datasetId, refreshWorkflow]);

  // Create new thread when dataset changes
  useEffect(() => {
    setThreadId(createNewThreadId());
  }, [datasetId]);

  // Create new chat thread
  const handleNewChat = useCallback(() => {
    setThreadId(createNewThreadId());
  }, []);

  // Prepare message with context injection (supports file parts)
  const prepareMessage = useCallback(
    (userMessage: string, additionalParts?: any[]): DistriMessage => {
      // Build context from current workflow state
      const contextText = buildContextMessage(datasetId, workflow, datasetHasEvalScript, planStatus);

      // Create message with context prepended
      const fullMessage = `${contextText}\n\nUser message: ${userMessage}`;

      // Start with the text part
      const parts: any[] = [{ part_type: 'text', data: fullMessage }];

      // Add any additional parts (files, images, etc.)
      if (additionalParts && additionalParts.length > 0) {
        parts.push(...additionalParts);
      }

      return DistriClient.initDistriMessage('user', parts);
    },
    [datasetId, workflow, datasetHasEvalScript, planStatus]
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
