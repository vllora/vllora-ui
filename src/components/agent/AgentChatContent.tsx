/**
 * AgentChatContent
 *
 * Shared content component for agent chat panels.
 * Includes header and chat/loading/error states.
 */

import { useCallback, useMemo, useEffect, useRef } from 'react';
import { DistriFnTool, DistriMessage } from '@distri/core';
import { Loader2 } from 'lucide-react';
import {
  LucyProviderCheck,
  LucyChat,
  LucyDefaultToolRenderer,
} from './lucy-agent';
import type { QuickAction } from './lucy-agent/LucyWelcome';
import { useAgentPanel } from '@/contexts/AgentPanelContext';
import { ProviderKeysConsumer } from '@/contexts/ProviderKeysContext';
import { eventEmitter, OpenTrace } from '@/utils/eventEmitter';
import { LucyAgentChatHeader } from './LucyAgentChatHeader';

// ============================================================================
// Quick Actions by Context
// ============================================================================

/** Quick actions for /chat?tab=threads (viewing a specific thread) */
const THREAD_QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'analyze-thread',
    icon: '🔍',
    label: 'Analyze this thread for issues',
  },
  {
    id: 'check-errors',
    icon: '❌',
    label: 'Check for errors in this thread',
  },
  {
    id: 'performance',
    icon: '⏱',
    label: 'Show me the slowest operations',
  },
  {
    id: 'cost',
    icon: '💰',
    label: "What's the total cost?",
  },
];

/** Quick actions for /chat?tab=traces (traces list view) */
const TRACES_QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'analyze-errors',
    icon: '🔍',
    label: 'Analyze latest error traces',
  },
  {
    id: 'filter-slow',
    icon: '⏱',
    label: 'Filter slow requests (>2s)',
  },
  {
    id: 'show-labels',
    icon: '🏷',
    label: 'What labels exist?',
  },
];

/** Quick actions for non-chat pages (guide user to /chat) */
const NON_CHAT_QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'go-to-traces',
    icon: '📊',
    label: 'Show me my traces',
  },
  {
    id: 'help',
    icon: '💡',
    label: 'What can you help me with?',
  },
  {
    id: 'analyze-errors',
    icon: '🔍',
    label: 'Find errors in my traces',
  },
];

/** Get quick actions based on current route context */
function getQuickActionsForContext(page: string, tab?: string): QuickAction[] {
  // Lucy works best on /chat - show relevant actions there
  if (page === 'chat') {
    if (tab === 'threads') {
      return THREAD_QUICK_ACTIONS;
    }
    if (tab === 'traces') {
      return TRACES_QUICK_ACTIONS;
    }
  }
  // On other pages, guide user toward trace analysis
  return NON_CHAT_QUICK_ACTIONS;
}

// ============================================================================
// Utilities
// ============================================================================

interface ViewContext {
  page: string;
  tab?: string;
  projectId?: string;
  threadId?: string;
  current_view_detail_of_span_id?: string;
  labels?: string[];
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

  const labels = searchParams.get('labels');
  if (labels) ctx.labels = labels.split(',');

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
  const { providers, loading: providersLoading } = ProviderKeysConsumer();

  // Derive provider ready state from providers context
  const isOpenAIConfigured = useMemo(() => {
    const openaiProvider = providers.find(p => p.name.toLowerCase() === 'openai');
    return openaiProvider?.has_credentials ?? false;
  }, [providers]);

  // Compute context-aware quick actions based on current URL
  const quickActions = useMemo(() => {
    if (typeof window === 'undefined') return NON_CHAT_QUICK_ACTIONS;
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const page = pathname.split('/')[1] || 'home';
    const tab = searchParams.get('tab') || undefined;
    return getQuickActionsForContext(page, tab);
  }, []);

  // Store openTraces from event emitter (works across context boundaries)
  const openTracesRef = useRef<{ openTraces: OpenTrace[]; source: 'threads' | 'traces' } | null>(null);
  const hoverSpanIdRef = useRef<{ hoverSpanId: string | undefined; source: 'threads' | 'traces' } | null>(null);

  // Listen for openTraces changes from ChatWindowContext and TracesPageContext
  useEffect(() => {
    const handleOpenTracesChanged = (data: { openTraces: OpenTrace[]; source: 'threads' | 'traces' }) => {
      openTracesRef.current = data;
    };

    const handleHoverSpanChanged = (data: { hoverSpanId: string | undefined; source: 'threads' | 'traces' }) => {
      hoverSpanIdRef.current = data;
    };

    eventEmitter.on('vllora_open_traces_changed', handleOpenTracesChanged);
    eventEmitter.on('vllora_hover_span_changed', handleHoverSpanChanged);

    return () => {
      eventEmitter.off('vllora_open_traces_changed', handleOpenTracesChanged);
      eventEmitter.off('vllora_hover_span_changed', handleHoverSpanChanged);
    };
  }, []);

  // Create tool renderers with Lucy styling
  const toolRenderers = useMemo(
    () => ({
      // Use LucyDefaultToolRenderer for all tools
      // Add specific tool overrides here if needed
      default: LucyDefaultToolRenderer,
    }),
    []
  );

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

      // Get openTraces from event emitter ref (matches current tab)
      let openTraces: OpenTrace[] | undefined;
      let hoverSpanId: string | undefined;
      const tracesData = openTracesRef.current;
      const hoverData = hoverSpanIdRef.current;

      if (tracesData) {
        // Only include if source matches current tab
        if (ctx.page === 'chat' && ctx.tab === 'threads' && tracesData.source === 'threads') {
          openTraces = tracesData.openTraces;
        } else if (ctx.page === 'chat' && ctx.tab === 'traces' && tracesData.source === 'traces') {
          openTraces = tracesData.openTraces;
        }
      }

      if (hoverData) {
        // Only include if source matches current tab
        if (ctx.page === 'chat' && ctx.tab === 'threads' && hoverData.source === 'threads') {
          hoverSpanId = hoverData.hoverSpanId;
        } else if (ctx.page === 'chat' && ctx.tab === 'traces' && hoverData.source === 'traces') {
          hoverSpanId = hoverData.hoverSpanId;
        }
      }

      // Build extended context with openTraces and hoverSpanId if available
      let extendedCtx: ViewContext & { open_run_ids?: string[]; hover_span_id?: string } = { ...ctx };
      if (openTraces && openTraces.length > 0) {
        extendedCtx.open_run_ids = openTraces.map(trace => trace.run_id);
      }
      if (hoverSpanId) {
        extendedCtx.hover_span_id = hoverSpanId;
      }

      const contextText = `Context:\n\`\`\`json\n${JSON.stringify(extendedCtx, null, 2)}\n\`\`\``;

      // Add context as a separate part at the beginning
      const contextPart = { part_type: 'text' as const, data: contextText };

      return { ...message, parts: [contextPart, ...message.parts] };
    },
    []
  );

  return (
    <>
      <LucyAgentChatHeader
        isPinned={isPinned}
        onToggleMode={toggleMode}
        onNewChat={onNewChat}
        onClose={onClose}
        className={headerClassName}
        isDragHandle={isDragHandle}
      />

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {providersLoading ? (
          // Loading providers
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center space-x-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm text-muted-foreground">
                Checking configuration...
              </span>
            </div>
          </div>
        ) : !isOpenAIConfigured ? (
          // OpenAI provider not configured, show setup UI
          <LucyProviderCheck onReady={onConnected} />
        ) : agentLoading ? (
          // Provider ready, loading agent/Distri connection
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center space-x-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm text-muted-foreground">
                Loading assistant...
              </span>
            </div>
          </div>
        ) : isConnected && agent ? (
          // Connected and agent ready, show chat
          <LucyChat
            threadId={threadId}
            agent={agent}
            externalTools={tools}
            initialMessages={messages}
            beforeSendMessage={handleBeforeSendMessage}
            toolRenderers={toolRenderers}
            quickActions={quickActions}
          />
        ) : (
          // Provider ready but connection failed
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center space-x-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm text-muted-foreground">
                Connecting to assistant...
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
