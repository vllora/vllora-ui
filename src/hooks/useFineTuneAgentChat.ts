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
import type { ExecutionProgress } from '@/lib/distri-finetune-tools/steps/execute-plan';
import { stockfishTools, isChessDataset } from '@/lib/distri-finetune-tools/steps';
import { finetuneWorkflowService, FinetuneWorkflowState } from '@/services/finetune-workflow-db';
import { getDatasetById } from '@/services/datasets-db';
import { getDryRunJobsByDataset } from '@/services/dry-run-jobs-db';
import { getIterationState } from '@/services/finetune-iteration-db';
import type { DryRunJob } from '@/types/dry-run-job';
import type { IterationState } from '@/services/finetune-iteration-db';
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

const THREAD_STORAGE_KEY = 'lucy_thread_';

function createNewThreadId(): string {
  return uuidv4();
}

/**
 * Get or create a persistent thread ID for a dataset.
 * Stores in localStorage so chat history survives page refreshes.
 */
function getOrCreateThreadId(datasetId: string): string {
  const key = `${THREAD_STORAGE_KEY}${datasetId}`;
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  const newId = createNewThreadId();
  localStorage.setItem(key, newId);
  return newId;
}

// ============================================================================
// Context Builder
// ============================================================================

function buildContextMessage(
  datasetId: string,
  workflow: FinetuneWorkflowState | null,
  datasetHasEvaluator?: boolean,
  planStatus?: PlanStatus | null,
  executionProgress?: ExecutionProgress | null,
  catchUpContext?: string | null,
): string {
  const context = workflowToContext(datasetId, workflow, datasetHasEvaluator, planStatus, executionProgress);
  // Put dataset_id prominently at the top to help LLM copy it exactly
  // UUIDs are hard for LLMs to transcribe from JSON - make it explicit
  let msg = `DATASET_ID: ${datasetId}\n\nContext:\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;
  if (catchUpContext) {
    msg += `\n\n${catchUpContext}`;
  }
  return msg;
}

// ============================================================================
// Catch-Up Context Builder
// ============================================================================

/** Structured catch-up card data for rendering rich cards in the sidebar. */
export interface CatchUpCardData {
  readonly completedJobs: ReadonlyArray<{
    readonly jobId: string;
    readonly averageScore?: number;
    readonly completedAt?: number;
    readonly verdict?: string;
    readonly totalRows?: number;
  }>;
  readonly failedJobs: ReadonlyArray<{
    readonly jobId: string;
    readonly errorMessage?: string;
    readonly failedAt?: number;
  }>;
  readonly pendingDecision?: {
    readonly iterationNumber: number;
    readonly proposedChanges: ReadonlyArray<{
      readonly lever: string;
      readonly description: string;
      readonly applied: boolean;
    }>;
    readonly lastScore?: number;
  };
}

/** Combined catch-up result: text for agent context + structured data for UI cards. */
interface CatchUpResult {
  readonly text: string | null;
  readonly cards: CatchUpCardData | null;
}

/**
 * Build catch-up context for Lucy when a dataset is reopened.
 * Returns both text (for agent context injection) and structured card data (for rich UI).
 */
async function buildCatchUpContext(datasetId: string): Promise<CatchUpResult> {
  const sections: string[] = [];
  const completedJobs: CatchUpCardData['completedJobs'][number][] = [];
  const failedJobs: CatchUpCardData['failedJobs'][number][] = [];
  let pendingDecision: CatchUpCardData['pendingDecision'];

  try {
    // Check for unreviewed dry run jobs
    const jobs = await getDryRunJobsByDataset(datasetId);
    const unreviewedCompleted = jobs.filter(
      (j: DryRunJob) => j.status === 'completed' && !j.reviewedByAgent
    );
    const unreviewedFailed = jobs.filter(
      (j: DryRunJob) => j.status === 'failed' && !j.reviewedByAgent
    );

    if (unreviewedCompleted.length > 0) {
      for (const j of unreviewedCompleted) {
        const avgScore = j.pollingSnapshot?.summary?.average_score;
        completedJobs.push({
          jobId: j.id,
          averageScore: avgScore ?? undefined,
          completedAt: j.completedAt ?? undefined,
          verdict: undefined,
          totalRows: j.pollingSnapshot?.total_rows ?? undefined,
        });
      }
      const jobSummaries = unreviewedCompleted.map((j: DryRunJob) => {
        const avgScore = j.pollingSnapshot?.summary?.average_score;
        const scoreStr = avgScore != null ? ` (avg score: ${avgScore.toFixed(3)})` : '';
        return `- Job ${j.id}${scoreStr}, completed at ${new Date(j.completedAt ?? 0).toLocaleString()}`;
      });
      sections.push(
        `CATCH_UP: ${unreviewedCompleted.length} completed evaluation(s) not yet reviewed:\n${jobSummaries.join('\n')}\nUse get_evaluation_details to analyze results, then mark_job_reviewed after presenting to user.`
      );
    }

    if (unreviewedFailed.length > 0) {
      for (const j of unreviewedFailed) {
        failedJobs.push({
          jobId: j.id,
          errorMessage: j.error ?? undefined,
          failedAt: j.completedAt ?? undefined,
        });
      }
      const failSummaries = unreviewedFailed.map((j: DryRunJob) => {
        const errMsg = j.error ? `: ${j.error.slice(0, 200)}` : '';
        return `- Job ${j.id} failed${errMsg}`;
      });
      sections.push(
        `CATCH_UP: ${unreviewedFailed.length} failed evaluation(s):\n${failSummaries.join('\n')}\nPresent the error and suggest fixes, then mark_job_reviewed.`
      );
    }

    // Check for pending iteration proposals
    const iterState: IterationState | null = await getIterationState(datasetId);
    if (iterState?.phase === 'awaiting_user') {
      const changes = iterState.innerLoop.proposedChanges ?? [];
      pendingDecision = {
        iterationNumber: iterState.iterationNumber,
        proposedChanges: changes.map((c) => ({
          lever: c.lever,
          description: c.description,
          applied: c.applied,
        })),
        lastScore: iterState.innerLoop.lastDryRunScore ?? undefined,
      };
      const changesSummary = changes.length > 0
        ? changes.map((c) => `- [${c.lever}] ${c.description}`).join('\n')
        : 'No specific changes recorded';
      sections.push(
        `CATCH_UP: Iteration ${iterState.iterationNumber} has pending proposed changes (user hasn't responded yet):\n${changesSummary}\nRe-present these proposals to the user.`
      );
    }
  } catch (error) {
    // Non-critical — don't block chat initialization
    console.error('[buildCatchUpContext] Error:', error);
  }

  const hasCards = completedJobs.length > 0 || failedJobs.length > 0 || pendingDecision != null;
  return {
    text: sections.length > 0 ? sections.join('\n\n') : null,
    cards: hasCards ? { completedJobs, failedJobs, pendingDecision } : null,
  };
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
  /** Current plan status (from PlanContext) */
  planStatus?: PlanStatus | null;
  /** Current execution progress (from PlanContext, used for resume context) */
  executionProgress?: ExecutionProgress | null;
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
  /** Structured catch-up card data for rendering rich cards on session resume */
  catchUpCards: CatchUpCardData | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useFineTuneAgentChat(
  options: UseFineTuneAgentChatOptions
): UseFineTuneAgentChatReturn {
  const { datasetId, trainingGoals, planStatus, executionProgress: executionProgressFromContext } = options;

  // Agent state
  const { agent, loading: agentLoading } = useAgent({
    agentIdOrDef: FINETUNE_AGENT_NAME,
  });

  // Thread state - persisted per dataset so chat history survives refresh
  const [threadId, setThreadId] = useState<string>(() => getOrCreateThreadId(datasetId));

  // Workflow state
  const [workflow, setWorkflow] = useState<FinetuneWorkflowState | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  // Track if dataset has eval script configured (via UI, separate from workflow)
  const [datasetHasEvalScript, setDatasetHasEvalScript] = useState(false);
  // Catch-up context for session resumption (unreviewed jobs, pending proposals)
  const [catchUpContext, setCatchUpContext] = useState<string | null>(null);
  // Structured catch-up card data for rendering rich cards in the sidebar
  const [catchUpCards, setCatchUpCards] = useState<CatchUpCardData | null>(null);

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
      const [workflowState, dataset, catchUp] = await Promise.all([
        finetuneWorkflowService.getWorkflowByDataset(datasetId),
        getDatasetById(datasetId),
        buildCatchUpContext(datasetId),
      ]);
      setWorkflow(workflowState);
      setDatasetHasEvalScript(!!dataset?.evalScript);
      setCatchUpContext(catchUp.text);
      setCatchUpCards(catchUp.cards);
    } catch (error) {
      console.error('[useFineTuneAgentChat] Error loading workflow:', error);
      setWorkflow(null);
      setDatasetHasEvalScript(false);
      setCatchUpContext(null);
      setCatchUpCards(null);
    } finally {
      setWorkflowLoading(false);
    }
  }, [datasetId]);

  // Initial load
  useEffect(() => {
    refreshWorkflow();
  }, [refreshWorkflow]);

  // Listen for workflow updated events (e.g., after execute_plan completes)
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

  // Load persisted thread when dataset changes
  useEffect(() => {
    setThreadId(getOrCreateThreadId(datasetId));
  }, [datasetId]);

  // Create new chat thread (persists to localStorage)
  const handleNewChat = useCallback(() => {
    const newId = createNewThreadId();
    localStorage.setItem(`${THREAD_STORAGE_KEY}${datasetId}`, newId);
    setThreadId(newId);
  }, [datasetId]);

  // Prepare message with context injection (supports file parts)
  const prepareMessage = useCallback(
    (userMessage: string, additionalParts?: any[]): DistriMessage => {
      // Build context from current workflow state
      const contextText = buildContextMessage(datasetId, workflow, datasetHasEvalScript, planStatus, executionProgressFromContext, catchUpContext);

      // Create message with context prepended
      const fullMessage = `${contextText}\n\nUser message: ${userMessage}`;

      // Start with the text part
      const parts: any[] = [{ part_type: 'text', data: fullMessage }];

      // Add any additional parts (files, images, etc.)
      if (additionalParts && additionalParts.length > 0) {
        parts.push(...additionalParts);
      }

      // Clear catch-up context after first use (only inject once)
      if (catchUpContext) {
        setCatchUpContext(null);
      }

      return DistriClient.initDistriMessage('user', parts);
    },
    [datasetId, workflow, datasetHasEvalScript, planStatus, executionProgressFromContext, catchUpContext]
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
    catchUpCards,
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
