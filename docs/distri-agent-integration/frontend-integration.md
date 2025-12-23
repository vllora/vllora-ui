# Frontend Integration

This document covers how to integrate Distri agents into the vLLora React application.

## Overview

The frontend integration consists of:

1. **DistriProvider** - Wraps app with Distri client and auto-syncs agents
2. **useVlloraAgent hook** - Handles communication with agents
3. **Event Emitter** - Enables tools to interact with React components
4. **Agent Sync** - Runtime verification and self-healing

## 1. DistriProvider

**File:** `src/providers/DistriProvider.tsx`

```typescript
import { DistriProvider as BaseDistriProvider, useDistriClient } from '@distri/react';
import { ReactNode, useEffect, useState } from 'react';
import { ensureAgentsRegistered } from '@/lib/agent-sync';

interface Props {
  children: ReactNode;
}

// Inner component that has access to the Distri client
function AgentSyncInitializer({ children }: { children: ReactNode }) {
  const client = useDistriClient();
  const [syncStatus, setSyncStatus] = useState<'pending' | 'ok' | 'recovered' | 'error'>('pending');

  useEffect(() => {
    if (!client) return;

    // Run agent sync on app startup (hybrid approach - runtime safety net)
    ensureAgentsRegistered(client)
      .then((result) => {
        setSyncStatus(result.status);
        if (result.status === 'recovered') {
          console.log('[DistriProvider] Recovered missing agents:', result.registered);
        }
      })
      .catch((err) => {
        console.error('[DistriProvider] Agent sync failed:', err);
        setSyncStatus('error');
      });
  }, [client]);

  // Optional: Show loading state while syncing
  // if (syncStatus === 'pending') {
  //   return <div>Initializing agent system...</div>;
  // }

  return <>{children}</>;
}

export function DistriProvider({ children }: Props) {
  const config = {
    baseUrl: import.meta.env.VITE_DISTRI_URL || 'http://localhost:8080',
  };

  return (
    <BaseDistriProvider config={config}>
      <AgentSyncInitializer>
        {children}
      </AgentSyncInitializer>
    </BaseDistriProvider>
  );
}
```

This provider:
1. Connects to the Distri server
2. **Automatically verifies agents exist** on startup (hybrid approach)
3. **Self-heals** by re-registering missing agents from bundled files
4. Provides the client to all child components via context

---

## 2. useVlloraAgent Hook

**File:** `src/hooks/useVlloraAgent.ts`

This hook handles BOTH UI tools and Data tools since all agents use `external = ["*"]`.

```typescript
import { useState, useCallback } from 'react';
import { useChat, useAgent } from '@distri/react';
import { executeUiTool, isUiTool } from '@/lib/distri-ui-tools';
import { executeDataTool, isDataTool } from '@/lib/distri-data-tools';

interface Activity {
  type: 'thinking' | 'tool_call' | 'agent_call' | 'response' | 'error';
  content: string;
  timestamp: Date;
}

export function useVlloraAgent() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const { agent } = useAgent({ agentId: 'vllora_main_agent' });

  const {
    messages,
    sendMessage,
    isStreaming,
    stopStreaming
  } = useChat({
    agent,
    onToolCall: async (toolCall) => {
      setActivities(prev => [...prev, {
        type: 'tool_call',
        content: `${toolCall.name}(${JSON.stringify(toolCall.input)})`,
        timestamp: new Date()
      }]);

      const input = toolCall.input || {};

      // Handle UI tools (11 tools: 5 GET STATE + 6 CHANGE UI)
      if (isUiTool(toolCall.name)) {
        const result = await executeUiTool(toolCall.name, input);
        return { toolCallId: toolCall.id, result: JSON.stringify(result) };
      }

      // Handle Data tools (4 tools: fetch_runs, fetch_spans, get_run_details, fetch_groups)
      if (isDataTool(toolCall.name)) {
        const result = await executeDataTool(toolCall.name, input);
        return { toolCallId: toolCall.id, result: JSON.stringify(result) };
      }

      // Unknown tool - let Distri handle it (shouldn't happen with external = ["*"])
      return undefined;
    },
    onError: (error) => {
      setActivities(prev => [...prev, {
        type: 'error',
        content: error.message,
        timestamp: new Date()
      }]);
    }
  });

  const sendToAgent = useCallback(async (text: string) => {
    setActivities([]);
    await sendMessage({ text });
  }, [sendMessage]);

  return {
    messages,
    sendToAgent,
    isProcessing: isStreaming,
    activities,
    cancel: stopStreaming
  };
}
```

---

## 3. Agent Sync (Self-Healing)

**File:** `src/lib/agent-sync.ts`

Provides runtime agent verification and self-healing when agents are missing.

```typescript
import { DistriClient } from '@distri/core';

// Agent definitions bundled with the app (for self-healing)
const REQUIRED_AGENTS = [
  'vllora_main_agent',
  'vllora_ui_agent',
  'vllora_data_agent'
];

/**
 * Ensures all required agents are registered on the Distri server.
 * This provides self-healing capability if the server DB is wiped.
 */
export async function ensureAgentsRegistered(client: DistriClient): Promise<{
  status: 'ok' | 'recovered' | 'error';
  missing: string[];
  registered: string[];
}> {
  const result = {
    status: 'ok' as 'ok' | 'recovered' | 'error',
    missing: [] as string[],
    registered: [] as string[]
  };

  try {
    // Get list of agents currently on server
    const existingAgents = await client.listAgents();

    // Check which required agents are missing
    for (const agentName of REQUIRED_AGENTS) {
      if (!existingAgents.includes(agentName)) {
        result.missing.push(agentName);
      }
    }

    // If any agents are missing, try to re-register them
    if (result.missing.length > 0) {
      console.warn(`[Agent Sync] Missing agents detected: ${result.missing.join(', ')}`);

      for (const agentName of result.missing) {
        try {
          // Try to fetch agent content from public folder
          const response = await fetch(`/agents/${agentName.replace('_', '-')}.md`);
          if (response.ok) {
            const content = await response.text();
            await client.registerAgent(content);
            result.registered.push(agentName);
            console.log(`[Agent Sync] Re-registered: ${agentName}`);
          }
        } catch (err) {
          console.error(`[Agent Sync] Failed to register ${agentName}:`, err);
        }
      }

      result.status = result.registered.length > 0 ? 'recovered' : 'error';
    }

    return result;
  } catch (error) {
    console.error('[Agent Sync] Failed to verify agents:', error);
    return { ...result, status: 'error' };
  }
}

/**
 * Verifies agent versions match the deployed app version.
 * Useful for ensuring UI and agents stay in sync.
 */
export async function verifyAgentVersions(
  client: DistriClient,
  expectedVersion: string
): Promise<boolean> {
  try {
    for (const agentName of REQUIRED_AGENTS) {
      const agent = await client.getAgent(agentName);
      if (agent?.metadata?.version !== expectedVersion) {
        console.warn(`[Agent Sync] Version mismatch for ${agentName}`);
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
```

---

## 4. Extended Event Emitter

**File:** `src/utils/eventEmitter.ts`

Add Distri-specific events to the existing event emitter:

```typescript
import { McpServerConfig } from '@/services/mcp-api';
import mitt, { Emitter } from 'mitt';

type Events = {
  // ============================================================================
  // Existing events (keep as-is)
  // ============================================================================
  vllora_input_fileAdded: { files: any[] };
  vllora_input_chatSubmit: {
    inputText: string;
    files: any[];
    searchToolEnabled?: boolean;
    otherTools?: string[];
    toolsUsage?: Map<string, McpServerConfig>;
  };
  vllora_chatTerminate: { threadId: string; widgetId?: string };
  vllora_clearChat: { threadId?: string; widgetId?: string };
  vllora_chat_scrollToBottom: { threadId?: string; widgetId?: string };
  vllora_usageStats: { usage: any; threadId?: string; widgetId?: string };
  vllora_chatWindow: {
    widgetId: string;
    state: string;
    threadId?: string;
    messageId?: string;
    traceId?: string;
    runId?: string;
    error?: string;
  };
  vllora_input_speechRecognitionStart: Record<string, never>;
  vllora_input_speechRecognitionEnd: Record<string, never>;

  // ============================================================================
  // GET STATE events (5 tools) - Request/Response pattern
  // Components listen for requests and emit responses
  // ============================================================================

  // get_current_view: page, project, thread, theme, modal
  vllora_get_current_view: Record<string, never>;
  vllora_current_view_response: {
    page: string;
    projectId: string | null;
    threadId: string | null;
    theme: string;
    modal: string | null;
  };

  // get_selection_context: selected run, span, detail span, text
  vllora_get_selection_context: Record<string, never>;
  vllora_selection_context_response: {
    selectedRunId: string | null;
    selectedSpanId: string | null;
    detailSpanId: string | null;
    textSelection: string | null;
  };

  // get_thread_runs: list of runs in current thread
  vllora_get_thread_runs: Record<string, never>;
  vllora_thread_runs_response: {
    runs: Array<{
      run_id: string;
      status: string;
      model?: string;
      duration_ms?: number;
    }>;
  };

  // get_span_details: detailed info about specific span
  vllora_get_span_details: { spanId: string };
  vllora_span_details_response: {
    span: {
      span_id: string;
      operation_name: string;
      duration_ms: number;
      status: string;
      attributes: Record<string, any>;
    } | null;
  };

  // get_collapsed_spans: list of collapsed span IDs
  vllora_get_collapsed_spans: Record<string, never>;
  vllora_collapsed_spans_response: { collapsedSpanIds: string[] };

  // ============================================================================
  // CHANGE UI events (6 tools) - Fire-and-forget pattern
  // Components listen and update state
  // ============================================================================

  // select_span: select and highlight a span (uses existing setSelectedSpanId)
  vllora_select_span: { spanId: string };

  // select_run: select a run to display (uses existing setSelectedRunId)
  vllora_select_run: { runId: string };

  // expand_span: expand a collapsed span (removes from collapsedSpans)
  vllora_expand_span: { spanId: string };

  // collapse_span: collapse an expanded span (adds to collapsedSpans)
  vllora_collapse_span: { spanId: string };

  // Note: open_modal, close_modal are handled directly via import
};

export const emitter: Emitter<Events> = mitt<Events>();
```

---

## 5. App Integration

Update `src/App.tsx` or `src/main.tsx`:

```typescript
import { DistriProvider } from '@/providers/DistriProvider';

function App() {
  return (
    <DistriProvider>
      {/* ... existing app content ... */}
    </DistriProvider>
  );
}
```

---

## 6. Using the Agent in Components

Example integration in a chat component:

```typescript
import { useVlloraAgent } from '@/hooks/useVlloraAgent';

function ChatWithAgent() {
  const [input, setInput] = useState('');
  const { sendToAgent, isProcessing, messages, activities } = useVlloraAgent();

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text) return;

    // Check if it's an agent command
    if (text.startsWith('@agent ') || text.startsWith('/agent ')) {
      const agentMessage = text.replace(/^(@agent|\/agent)\s+/, '');
      setInput('');
      await sendToAgent(agentMessage);
      return;
    }

    // Normal chat handling...
  };

  return (
    <div>
      {/* Show agent activities */}
      {activities.map((activity, i) => (
        <div key={i} className="text-sm text-muted-foreground">
          [{activity.type}] {activity.content}
        </div>
      ))}

      {/* Chat input */}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        disabled={isProcessing}
        placeholder="Type @agent to interact with the AI assistant..."
      />
    </div>
  );
}
```

---

## 7. Event Listeners in Components

Components need to listen for Distri events and respond. The vLLora UI uses `TracesPageContext` for selection state, so event listeners should be added there.

### Add Event Listeners to TracesPageContext

Update `src/contexts/TracesPageContext.tsx` to listen for Distri events. Add this inside `useTracesPageContext` function:

```typescript
import { emitter } from '@/utils/eventEmitter';
import { getThemeFromStorage } from '@/themes/themes';

// Add this useEffect inside useTracesPageContext, after existing hooks:
useEffect(() => {
  // GET STATE handlers - respond with current context values
  const handleGetSelectionContext = () => {
    emitter.emit('vllora_selection_context_response', {
      selectedRunId,
      selectedSpanId,
      detailSpanId,
      textSelection: window.getSelection()?.toString() || null,
    });
  };

  const handleGetCurrentView = () => {
    emitter.emit('vllora_current_view_response', {
      page: window.location.pathname,
      projectId,
      threadId: searchParams.get('thread_id'),
      theme: getThemeFromStorage(),
      modal: null, // Would need ModalContext access
    });
  };

  const handleGetThreadRuns = () => {
    emitter.emit('vllora_thread_runs_response', {
      runs: runs.map(r => ({
        run_id: r.run_id,
        status: r.status || 'unknown',
        model: r.model_name,
        duration_ms: r.duration_ms,
      })),
    });
  };

  const handleGetCollapsedSpans = () => {
    emitter.emit('vllora_collapsed_spans_response', {
      collapsedSpanIds: Array.from(collapsedSpans),
    });
  };

  // CHANGE UI handlers - update context state
  const handleSelectSpan = ({ spanId }: { spanId: string }) => {
    setSelectedSpanId(spanId);
    // Optional: scroll span into view
  };

  const handleSelectRun = ({ runId }: { runId: string }) => {
    setSelectedRunId(runId);
    fetchSpansByRunId(runId);
  };

  const handleExpandSpan = ({ spanId }: { spanId: string }) => {
    setCollapsedSpans(prev => {
      const next = new Set(prev);
      next.delete(spanId);
      return next;
    });
  };

  const handleCollapseSpan = ({ spanId }: { spanId: string }) => {
    setCollapsedSpans(prev => new Set(prev).add(spanId));
  };

  // Register all event listeners
  emitter.on('vllora_get_selection_context', handleGetSelectionContext);
  emitter.on('vllora_get_current_view', handleGetCurrentView);
  emitter.on('vllora_get_thread_runs', handleGetThreadRuns);
  emitter.on('vllora_get_collapsed_spans', handleGetCollapsedSpans);
  emitter.on('vllora_select_span', handleSelectSpan);
  emitter.on('vllora_select_run', handleSelectRun);
  emitter.on('vllora_expand_span', handleExpandSpan);
  emitter.on('vllora_collapse_span', handleCollapseSpan);

  return () => {
    emitter.off('vllora_get_selection_context', handleGetSelectionContext);
    emitter.off('vllora_get_current_view', handleGetCurrentView);
    emitter.off('vllora_get_thread_runs', handleGetThreadRuns);
    emitter.off('vllora_get_collapsed_spans', handleGetCollapsedSpans);
    emitter.off('vllora_select_span', handleSelectSpan);
    emitter.off('vllora_select_run', handleSelectRun);
    emitter.off('vllora_expand_span', handleExpandSpan);
    emitter.off('vllora_collapse_span', handleCollapseSpan);
  };
}, [
  selectedRunId, selectedSpanId, detailSpanId, projectId,
  runs, collapsedSpans, searchParams,
  setSelectedSpanId, setSelectedRunId, setCollapsedSpans, fetchSpansByRunId
]);
```

### Key Points

1. **TracesPageContext already has the state** we need (`selectedRunId`, `selectedSpanId`, `collapsedSpans`)
2. `collapsedSpans` is a `Set<string>` - convert to array for event response
3. `runs` array contains `RunDTO` objects with `run_id`, `status`, `model_name`, `duration_ms`
4. The event listeners bridge agent tools to existing React state

---

## Environment Variables

**File:** `.env.local`

```bash
# Distri Server URL
VITE_DISTRI_URL=http://localhost:8080

# vLLora Backend URL (for reference)
VITE_API_URL=http://localhost:9090
```

## Related Documents

- [Tools](./tools.md) - Tool handler implementations
- [Setup Guide](./setup-guide.md) - Complete setup steps
- [UI Design](./ui-design.md) - Agent panel component design
