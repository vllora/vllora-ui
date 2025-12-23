/**
 * AgentPanel
 *
 * Main chat panel that uses the @distri/react Chat component directly.
 * Provides a sliding panel interface for the vLLora AI assistant.
 */

import { useState, useMemo, useCallback } from 'react';
import { Chat, useAgent, useChatMessages } from '@distri/react';
import { uuidv4, DistriFnTool } from '@distri/core';
import { X, MessageCircle, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getMainAgentName } from '@/lib/agent-sync';
import { uiTools } from '@/lib/distri-ui-tools';
import { dataTools } from '@/lib/distri-data-tools';
import { useAgentToolListeners } from '@/hooks/useAgentToolListeners';

// ============================================================================
// Types
// ============================================================================

interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  /** Which side to show the panel ('left' or 'right') */
  side?: 'left' | 'right';
}

// ============================================================================
// Thread ID Management
// ============================================================================

function getThreadId(): string {
  const threadId = localStorage.getItem('vllora:agentThreadId');
  if (!threadId) {
    const newThreadId = uuidv4();
    localStorage.setItem('vllora:agentThreadId', newThreadId);
    return newThreadId;
  }
  return threadId;
}

function setThreadId(threadId: string): void {
  localStorage.setItem('vllora:agentThreadId', threadId);
}

// ============================================================================
// Component
// ============================================================================

export function AgentPanel({ isOpen, onClose, className, side = 'left' }: AgentPanelProps) {
  const agentName = getMainAgentName();
  const { agent, loading: agentLoading } = useAgent({ agentIdOrDef: agentName });
  const [selectedThreadId, setSelectedThreadId] = useState<string>(getThreadId());

  // Listen for agent tool events and respond with UI state
  // This enables tools like get_current_view, get_selection_context, etc.
  useAgentToolListeners();

  // Combine UI and Data tools
  const tools = useMemo<DistriFnTool[]>(() => {
    const allTools = [...uiTools, ...dataTools];
    console.log('[AgentPanel] External tools registered:', allTools.map(t => t.name));
    return allTools;
  }, []);

  // Get existing messages for the thread
  const { messages } = useChatMessages({
    agent: agent!,
    threadId: selectedThreadId,
    onError: (error) => {
      console.error('[AgentPanel] Error fetching messages:', error);
    },
  });

  // Thread management
  const handleNewChat = useCallback(() => {
    const newThreadId = uuidv4();
    setSelectedThreadId(newThreadId);
    setThreadId(newThreadId);
  }, []);

  // Loading state
  if (agentLoading) {
    return (
      <AgentPanelContainer isOpen={isOpen} onClose={onClose} className={className} side={side}>
        <div className="flex items-center justify-center h-full">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading assistant...</span>
          </div>
        </div>
      </AgentPanelContainer>
    );
  }

  // Error state - agent not available
  if (!agent) {
    return (
      <AgentPanelContainer isOpen={isOpen} onClose={onClose} className={className} side={side}>
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Agent Not Available</h3>
          <p className="text-sm text-muted-foreground mb-4">
            The Distri backend server may not be running. Please check your connection.
          </p>
        </div>
      </AgentPanelContainer>
    );
  }

  return (
    <AgentPanelContainer isOpen={isOpen} onClose={onClose} className={className} side={side}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            <span className="font-medium">vLLora Assistant</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleNewChat} title="New Chat">
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Chat */}
        <div className="flex-1 overflow-hidden">
          <Chat
            threadId={selectedThreadId}
            agent={agent}
            externalTools={tools}
            initialMessages={messages}
            theme="dark"
          />
        </div>
      </div>
    </AgentPanelContainer>
  );
}

// ============================================================================
// Container Component
// ============================================================================

interface AgentPanelContainerProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  /** Which side to show the panel ('left' or 'right') */
  side?: 'left' | 'right';
}

function AgentPanelContainer({ isOpen, onClose, className, children, side = 'left' }: AgentPanelContainerProps) {
  const isRightSide = side === 'right';

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          'fixed top-0 h-full w-full sm:w-[400px] lg:w-[450px] z-50',
          'bg-background shadow-xl',
          'transform transition-transform duration-300 ease-in-out',
          // Position based on side
          isRightSide ? 'right-0 border-l' : 'left-0 border-r',
          // Slide animation based on side
          isOpen
            ? 'translate-x-0'
            : isRightSide
              ? 'translate-x-full'
              : '-translate-x-full',
          className
        )}
      >
        {children}
      </div>
    </>
  );
}

export default AgentPanel;
