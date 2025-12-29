/**
 * AgentChatContent
 *
 * Shared content component for agent chat panels.
 * Includes header and chat/loading/error states.
 */

import { useCallback } from 'react';
import { Chat } from '@distri/react';
import { DistriFnTool, DistriMessage } from '@distri/core';
import { X, Plus, Loader2, Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LucyAvatar } from './LucyAvatar';
import { LucySetupGuide } from './LucySetupGuide';
import { useAgentPanel } from '@/contexts/AgentPanelContext';

// ============================================================================
// Utilities
// ============================================================================

interface ViewContext {
  page: string;
  tab?: string;
  projectId?: string;
  threadId?: string;
  current_view_detail_of_span_id?: string;
}

function getViewContextFromURL(
  pathname: string,
  searchParams: URLSearchParams,
  detailSpanId?: string | null
): ViewContext {
  const page = pathname.split('/')[1] || 'home';
  const ctx: ViewContext = { page };

  const tab = searchParams.get('tab');
  if (tab) ctx.tab = tab;

  const projectId = searchParams.get('project_id') || searchParams.get('projectId');
  if (projectId) ctx.projectId = projectId;

  const threadId = searchParams.get('thread_id') || searchParams.get('threadId');
  if (threadId) ctx.threadId = threadId;

  if (detailSpanId) ctx.current_view_detail_of_span_id = detailSpanId;

  return ctx;
}

// ============================================================================
// Types
// ============================================================================

interface AgentChatContentProps {
  /** The agent instance */
  agent: any;
  /** Whether the agent is loading */
  agentLoading: boolean;
  /** Whether connected to Distri server */
  isConnected: boolean;
  /** Callback when connection is established (from setup guide) */
  onConnected: () => void;
  /** The current thread ID */
  threadId: string;
  /** External tools for the chat */
  tools: DistriFnTool[];
  /** Initial messages for the thread */
  messages: any[];
  /** Callback when new chat is requested */
  onNewChat: () => void;
  /** Callback when close is requested */
  onClose: () => void;
  /** Optional header className for additional styling */
  headerClassName?: string;
  /** Whether header is a drag handle (for floating panel) */
  isDragHandle?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function AgentChatContent({
  agent,
  agentLoading,
  isConnected,
  onConnected,
  threadId,
  tools,
  messages,
  onNewChat,
  onClose,
  headerClassName,
  isDragHandle = false,
}: AgentChatContentProps) {
  const { isPinned, toggleMode } = useAgentPanel();

  // Attach current view context to messages before sending
  // Read from window.location at send time to get latest URL state
  const handleBeforeSendMessage = useCallback(
    async (message: DistriMessage): Promise<DistriMessage> => {
      const currentParams = new URLSearchParams(window.location.search);
      const detailSpanId = currentParams.get('detail_span_id') || currentParams.get('span_id');

      const ctx = getViewContextFromURL(
        window.location.pathname,
        currentParams,
        detailSpanId
      );
      const contextText = `Context:\n\`\`\`json\n${JSON.stringify(ctx, null, 2)}\n\`\`\``;

      // Add context as a separate part at the beginning
      const contextPart = { part_type: 'text' as const, data: contextText };

      return { ...message, parts: [contextPart, ...message.parts] };
    },
    []
  );

  return (
    <>
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2 border-b shrink-0',
          isDragHandle && 'cursor-move select-none bg-muted/50',
          isDragHandle && 'drag-handle',
          headerClassName
        )}
      >
        <div className="flex items-center gap-2">
          <LucyAvatar size="sm" />
          <span className="font-medium text-sm">Lucy</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onNewChat}
            title="New Chat"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleMode}
            title={isPinned ? "Unpin (floating mode)" : "Pin (side panel)"}
          >
            {isPinned ? (
              <PinOff className="h-3.5 w-3.5" />
            ) : (
              <Pin className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-end overflow-hidden">
        {!isConnected ? (
          <LucySetupGuide onConnected={onConnected} />
        ) : agentLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center space-x-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm text-muted-foreground">
                Loading assistant...
              </span>
            </div>
          </div>
        ) : !agent ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <LucyAvatar size="lg" className="mb-4 opacity-50" />
            <h3 className="font-semibold mb-2">Lucy Not Available</h3>
            <p className="text-sm text-muted-foreground">
              Could not load agent. Please try again.
            </p>
          </div>
        ) : (
          <Chat
            threadId={threadId}
            agent={agent}
            externalTools={tools}
            initialMessages={messages}
            theme="dark"
            beforeSendMessage={handleBeforeSendMessage}
          />
        )}
      </div>
    </>
  );
}
