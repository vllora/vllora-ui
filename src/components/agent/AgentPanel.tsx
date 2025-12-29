/**
 * AgentPanel
 *
 * Sliding panel interface for the vLLora AI assistant.
 * Uses shared AgentChatContent for the chat functionality.
 */

import { cn } from '@/lib/utils';
import { useAgentChat } from './useAgentChat';
import { AgentChatContent } from './AgentChatContent';
import { useDistriConnection } from '@/providers/DistriProvider';

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
// Component
// ============================================================================

export function AgentPanel({ isOpen, onClose, className, side = 'left' }: AgentPanelProps) {
  const { isConnected, reconnect } = useDistriConnection();
  const {
    agent,
    agentLoading,
    selectedThreadId,
    tools,
    messages,
    handleNewChat,
  } = useAgentChat();

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
          'fixed top-0 h-full w-full sm:w-[384px] lg:w-[384px] z-50',
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
        <div className="flex flex-col h-full">
          <AgentChatContent
            agent={agent}
            agentLoading={agentLoading}
            isConnected={isConnected}
            onConnected={reconnect}
            threadId={selectedThreadId}
            tools={tools}
            messages={messages}
            onNewChat={handleNewChat}
            onClose={onClose}
          />
        </div>
      </div>
    </>
  );
}

export default AgentPanel;
