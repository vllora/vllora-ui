/**
 * useAgentChat Hook
 *
 * Shared hook for agent chat functionality.
 * Handles thread management, agent loading, tools, and messages.
 */

import { useState, useMemo, useCallback } from 'react';
import { useAgent, useChatMessages } from '@distri/react';
import { uuidv4, DistriFnTool } from '@distri/core';
import { getMainAgentName } from '@/lib/agent-sync';
import { uiTools } from '@/lib/distri-ui-tools';
import { dataTools } from '@/lib/distri-data-tools';
import { useAgentToolListeners } from '@/hooks/useAgentToolListeners';

// ============================================================================
// Thread ID Management
// ============================================================================

const THREAD_STORAGE_KEY = 'vllora:agentThreadId';

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

export function useAgentChat() {
  const agentName = getMainAgentName();
  const { agent, loading: agentLoading } = useAgent({ agentIdOrDef: agentName });
  const [selectedThreadId, setSelectedThreadId] = useState<string>(getThreadId());

  // Listen for agent tool events
  useAgentToolListeners();

  // Combine UI and Data tools
  const tools = useMemo<DistriFnTool[]>(() => {
    return [...uiTools, ...dataTools];
  }, []);

  // Get existing messages for the thread
  const { messages } = useChatMessages({
    agent: agent!,
    threadId: selectedThreadId,
    onError: (error: any) => {
      console.error('[useAgentChat] Error fetching messages:', error);
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
