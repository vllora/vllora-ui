# Frontend Integration

This document covers how to integrate Distri agents into the vLLora React application.

## Overview

The frontend integration consists of:

1. **DistriProvider** - Wraps app with Distri client and auto-syncs agents
2. **Chat Component** - Uses `@distri/react` Chat component directly with tools passed as props
3. **Event Emitter** - Enables tools to interact with React components
4. **Agent Sync** - Runtime verification and self-healing

## 1. DistriProvider

**File:** `src/providers/DistriProvider.tsx`

```typescript
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { DistriProvider as BaseDistriProvider } from '@distri/react';
import { ensureAgentsRegistered, checkDistriHealth, getDistriUrl } from '@/lib/agent-sync';

interface DistriContextValue {
  isConnected: boolean;
  isInitializing: boolean;
  error: string | null;
  reconnect: () => Promise<void>;
}

const DistriContext = createContext<DistriContextValue>({
  isConnected: false,
  isInitializing: true,
  error: null,
  reconnect: async () => {},
});

function DistriProviderInner({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initialize = useCallback(async () => {
    setIsInitializing(true);
    setError(null);

    try {
      // Check server health
      const isHealthy = await checkDistriHealth();
      if (!isHealthy) {
        setError('Cannot connect to Distri server');
        setIsConnected(false);
        return;
      }

      // Ensure agents are registered
      const agentsOk = await ensureAgentsRegistered();
      if (!agentsOk) {
        console.warn('[DistriProvider] Some agents may be missing');
      }

      setIsConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize');
      setIsConnected(false);
    } finally {
      setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const contextValue = useMemo(() => ({
    isConnected,
    isInitializing,
    error,
    reconnect: initialize,
  }), [isConnected, isInitializing, error, initialize]);

  return (
    <DistriContext.Provider value={contextValue}>
      {children}
    </DistriContext.Provider>
  );
}

export function DistriProvider({ children }: { children: React.ReactNode }) {
  const distriUrl = getDistriUrl();

  const config = useMemo(() => ({
    baseUrl: distriUrl,
    debug: import.meta.env.DEV,
  }), [distriUrl]);

  return (
    <BaseDistriProvider config={config}>
      <DistriProviderInner>{children}</DistriProviderInner>
    </BaseDistriProvider>
  );
}

export function useDistriConnection() {
  return useContext(DistriContext);
}
```

This provider:
1. Connects to the Distri server at `http://localhost:8081`
2. **Automatically verifies agents exist** on startup (hybrid approach)
3. **Self-heals** by re-registering missing agents from bundled files
4. Provides connection state context (`isConnected`, `isInitializing`, `error`) to child components

---

## 2. Using the Chat Component with Tools

**File:** `src/components/agent/AgentPanel.tsx`

Instead of a custom hook, we use the `@distri/react` Chat component directly and pass tools as props.

```typescript
import { Chat, useAgent, useChatMessages } from '@distri/react';
import { DistriFnTool } from '@distri/core';
import { uiTools } from '@/lib/distri-ui-tools';
import { dataTools } from '@/lib/distri-data-tools';

export function AgentPanel({ isOpen, onClose }: AgentPanelProps) {
  const agentName = 'vllora_main_agent';
  const { agent, loading } = useAgent({ agentIdOrDef: agentName });
  const [threadId, setThreadId] = useState<string>(getThreadId());

  // Combine UI and Data tools
  const tools = useMemo<DistriFnTool[]>(() => {
    return [...uiTools, ...dataTools];
  }, []);

  // Get existing messages for the thread
  const { messages } = useChatMessages({
    agent: agent!,
    threadId,
  });

  if (loading || !agent) {
    return <LoadingState />;
  }

  return (
    <Chat
      threadId={threadId}
      agent={agent}
      tools={tools}
      initialMessages={messages}
    />
  );
}
```

### Key Points

1. **Tools are passed via `tools` prop** - The Chat component accepts `DistriFnTool[]`
2. **Tools are defined in separate files** - `uiTools` from `distri-ui-tools.ts` and `dataTools` from `distri-data-tools.ts`
3. **Each tool has a `handler` function** - Handlers execute locally and return JSON strings
4. **No custom hook needed** - The Chat component handles all messaging and tool execution

---

## 3. Agent Sync (Self-Healing)

**File:** `src/lib/agent-sync.ts`

Provides runtime agent verification and self-healing when agents are missing.

```typescript
const DISTRI_URL = import.meta.env.VITE_DISTRI_URL || 'http://localhost:8081';

const AGENT_NAMES = [
  'vllora_main_agent',
  'vllora_ui_agent',
  'vllora_data_agent',
] as const;

/**
 * Fetch list of registered agents from Distri server
 */
async function fetchRegisteredAgents(): Promise<string[]> {
  try {
    const response = await fetch(`${DISTRI_URL}/agents`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return [];
    const agents = await response.json();
    return Array.isArray(agents) ? agents : [];
  } catch {
    return [];
  }
}

/**
 * Fetch agent definition from public/agents/
 */
async function fetchAgentDefinition(agentName: string): Promise<string | null> {
  try {
    const fileName = agentName.replace(/_/g, '-') + '.md';
    const response = await fetch(`/agents/${fileName}`);
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

/**
 * Register an agent with the Distri server
 */
async function registerAgent(agentName: string, definition: string): Promise<boolean> {
  try {
    const response = await fetch(`${DISTRI_URL}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/markdown' },
      body: definition,
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Ensure all agents are registered (self-healing)
 */
export async function ensureAgentsRegistered(): Promise<boolean> {
  const registeredAgents = await fetchRegisteredAgents();
  if (registeredAgents.length === 0) return false;

  const missingAgents = AGENT_NAMES.filter(name => !registeredAgents.includes(name));
  if (missingAgents.length === 0) return true;

  // Register missing agents from public/agents/
  for (const agentName of missingAgents) {
    const definition = await fetchAgentDefinition(agentName);
    if (definition) {
      await registerAgent(agentName, definition);
    }
  }
  return true;
}

/**
 * Check if Distri server is available
 */
export async function checkDistriHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${DISTRI_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function getDistriUrl(): string {
  return DISTRI_URL;
}

export function getMainAgentName(): string {
  return 'vllora_main_agent';
}
```

---

## 4. Extended Event Emitter

**File:** `src/utils/eventEmitter.ts`

Add Distri-specific events to the existing event emitter. **Note:** Response events use `Record<string, unknown>` for flexibility since actual data shapes vary.

```typescript
import { McpServerConfig } from '@/services/mcp-api';
import mitt, { Emitter } from 'mitt';

// ============================================================================
// Distri Agent Event Types
// ============================================================================

// GET STATE tool request/response events
// Using relaxed types for responses since actual data shapes vary
type DistriGetStateEvents = {
  vllora_get_current_view: Record<string, never>;
  vllora_current_view_response: Record<string, unknown>;

  vllora_get_selection_context: Record<string, never>;
  vllora_selection_context_response: Record<string, unknown>;

  vllora_get_thread_runs: Record<string, never>;
  vllora_thread_runs_response: Record<string, unknown>;

  vllora_get_span_details: Record<string, never>;
  vllora_span_details_response: Record<string, unknown>;

  vllora_get_collapsed_spans: Record<string, never>;
  vllora_collapsed_spans_response: Record<string, unknown>;
};

// CHANGE UI tool events (fire-and-forget)
type DistriChangeUiEvents = {
  vllora_select_span: { spanId: string };
  vllora_select_run: { runId: string };
  vllora_expand_span: { spanId: string };
  vllora_collapse_span: { spanId: string };
  // open_modal and close_modal use global ModalContext functions directly
};

// ============================================================================
// Existing vLLora Events
// ============================================================================

type VlloraEvents = {
  vllora_input_fileAdded: { files: any[] };
  vllora_input_chatSubmit: { /* ... */ };
  vllora_chatTerminate: { threadId: string; widgetId?: string };
  // ... other existing events
};

// ============================================================================
// Combined Events Type
// ============================================================================

type Events = VlloraEvents & DistriGetStateEvents & DistriChangeUiEvents;

export const emitter: Emitter<Events> = mitt<Events>();
export const eventEmitter = emitter; // Alias for consistency
export type { DistriGetStateEvents, DistriChangeUiEvents };
```

---

## 5. App Integration

Update `src/App.tsx` to include DistriProvider and AgentPanelWrapper:

```typescript
import { DistriProvider } from '@/providers/DistriProvider';
import { AgentPanelWrapper } from '@/components/agent';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Protected routes */}
            <Route path="/" element={
              <ProtectedRoute>
                <DistriProvider>
                  <ProjectsProvider>
                    {/* ... other providers ... */}
                    <Layout />
                    <AgentPanelWrapper />
                  </ProjectsProvider>
                </DistriProvider>
              </ProtectedRoute>
            }>
              {/* ... routes ... */}
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
```

The `AgentPanelWrapper` component:
- Renders a **floating toggle button** (draggable with edge snapping)
- Opens/closes the **agent chat panel**
- Uses `useDistriConnection()` to show loading state while initializing

---

## 6. Event Listeners in Components

Components need to listen for Distri events and respond. The vLLora UI uses `TracesPageContext` for selection state, so event listeners should be added there.

### Add Event Listeners to TracesPageContext

Update `src/contexts/TracesPageContext.tsx` to listen for Distri events:

```typescript
import { eventEmitter } from '@/utils/eventEmitter';
import { getThemeFromStorage } from '@/themes/themes';

// Add this useEffect inside TracesPageProvider:
useEffect(() => {
  // GET STATE handlers - respond with current context values
  const handleGetSelectionContext = () => {
    eventEmitter.emit('vllora_selection_context_response', {
      selectedRunId,
      selectedSpanId,
      detailSpanId,
      textSelection: window.getSelection()?.toString() || null,
    });
  };

  const handleGetCurrentView = () => {
    eventEmitter.emit('vllora_current_view_response', {
      page: window.location.pathname,
      projectId,
      threadId: searchParams.get('thread_id'),
      theme: getThemeFromStorage(),
      modal: null,
    });
  };

  const handleGetThreadRuns = () => {
    // Note: runMap is { [key: string]: Span[] }, not a Map instance
    const runsWithSpans = runs.map(run => ({
      ...run,
      spans: run.run_id ? runMap[run.run_id] || [] : [],
    }));
    eventEmitter.emit('vllora_thread_runs_response', {
      runs: runsWithSpans,
      groups: groups,
    });
  };

  const handleGetCollapsedSpans = () => {
    // Note: collapsedSpans is string[], not Set<string>
    eventEmitter.emit('vllora_collapsed_spans_response', {
      collapsedSpanIds: collapsedSpans,
    });
  };

  // CHANGE UI handlers - update context state
  const handleSelectSpan = ({ spanId }: { spanId: string }) => {
    setSelectedSpanId(spanId);
  };

  const handleSelectRun = ({ runId }: { runId: string }) => {
    setSelectedRunId(runId);
    // Fetch spans if not already loaded
    if (!runMap[runId]) {
      fetchSpansByRunId(runId);
    }
  };

  // Note: collapsedSpans is string[], use array methods
  const handleExpandSpan = ({ spanId }: { spanId: string }) => {
    setCollapsedSpans(prev => prev.filter(id => id !== spanId));
  };

  const handleCollapseSpan = ({ spanId }: { spanId: string }) => {
    setCollapsedSpans(prev => [...prev, spanId]);
  };

  // Register all event listeners
  eventEmitter.on('vllora_get_selection_context', handleGetSelectionContext);
  eventEmitter.on('vllora_get_current_view', handleGetCurrentView);
  eventEmitter.on('vllora_get_thread_runs', handleGetThreadRuns);
  eventEmitter.on('vllora_get_collapsed_spans', handleGetCollapsedSpans);
  eventEmitter.on('vllora_select_span', handleSelectSpan);
  eventEmitter.on('vllora_select_run', handleSelectRun);
  eventEmitter.on('vllora_expand_span', handleExpandSpan);
  eventEmitter.on('vllora_collapse_span', handleCollapseSpan);

  return () => {
    eventEmitter.off('vllora_get_selection_context', handleGetSelectionContext);
    eventEmitter.off('vllora_get_current_view', handleGetCurrentView);
    eventEmitter.off('vllora_get_thread_runs', handleGetThreadRuns);
    eventEmitter.off('vllora_get_collapsed_spans', handleGetCollapsedSpans);
    eventEmitter.off('vllora_select_span', handleSelectSpan);
    eventEmitter.off('vllora_select_run', handleSelectRun);
    eventEmitter.off('vllora_expand_span', handleExpandSpan);
    eventEmitter.off('vllora_collapse_span', handleCollapseSpan);
  };
}, [/* dependencies */]);
```

### Key Points

1. **TracesPageContext already has the state** we need (`selectedRunId`, `selectedSpanId`, `collapsedSpans`)
2. **`collapsedSpans` is `string[]`** (not Set) - use array methods like `filter` and spread
3. **`runMap` is an object** `{ [key: string]: Span[] }` (not a Map instance) - access with `runMap[id]`
4. The event listeners bridge agent tools to existing React state

---

## Environment Variables

**File:** `.env.local`

```bash
# Distri Server URL
VITE_DISTRI_URL=http://localhost:8081

# vLLora Backend URL (for reference)
VITE_API_URL=http://localhost:9090
```

## Related Documents

- [Tools](./tools.md) - Tool handler implementations
- [Setup Guide](./setup-guide.md) - Complete setup steps
- [UI Design](./ui-design.md) - Agent panel component design
