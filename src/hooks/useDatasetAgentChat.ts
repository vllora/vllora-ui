/**
 * useDatasetAgentChat Hook
 *
 * Specialized hook for dataset page agent chat functionality.
 * Uses the vllora_dataset_orchestrator agent with dataset-specific tools.
 */

import { useState, useMemo, useCallback } from 'react';
import { useAgent, useChatMessages } from '@distri/react';
import { uuidv4, DistriFnTool } from '@distri/core';
import { datasetTools } from '@/lib/distri-dataset-tools';

// ============================================================================
// Constants
// ============================================================================

const DATASET_AGENT_NAME = 'vllora_dataset_orchestrator';
const THREAD_STORAGE_KEY = 'vllora:datasetAgentThreadId';

// ============================================================================
// Thread ID Management
// ============================================================================

function getThreadId(): string {
  const threadId = localStorage.getItem(THREAD_STORAGE_KEY);
  if (!threadId) {
    const newThreadId = uuidv4();
    localStorage.setItem(THREAD_STORAGE_KEY, newThreadId);
    return newThreadId;
  }
  return threadId;
}

function setThreadId(threadId: string): void {
  localStorage.setItem(THREAD_STORAGE_KEY, threadId);
}

// ============================================================================
// Hook
// ============================================================================

export function useDatasetAgentChat() {
  const { agent, loading: agentLoading } = useAgent({ agentIdOrDef: DATASET_AGENT_NAME });
  const [selectedThreadId, setSelectedThreadId] = useState<string>(getThreadId());

  // Use dataset-specific tools (UI + Data + Analysis)
  const tools = useMemo<DistriFnTool[]>(() => datasetTools, []);
  // Get existing messages for the thread
  const { messages } = useChatMessages({
    agent: agent!,
    threadId: selectedThreadId,
    onError: (error: any) => {
      console.error('[useDatasetAgentChat] Error fetching messages:', error);
    },
  });

  // Create new chat thread
  const handleNewChat = useCallback(() => {
    const newThreadId = uuidv4();
    setSelectedThreadId(newThreadId);
    setThreadId(newThreadId);
  }, []);

  return {
    agent,
    agentLoading,
    selectedThreadId,
    tools,
    messages,
    handleNewChat,
  };
}
