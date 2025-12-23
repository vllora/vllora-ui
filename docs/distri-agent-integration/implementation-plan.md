# Implementation Plan

This document outlines the step-by-step implementation plan for integrating Distri multi-agent system into vLLora UI.

## Prerequisites

Before starting implementation:

- [ ] Distri server is running and accessible
- [ ] `@distri/core` and `@distri/react` packages are available (published or linked locally)
- [ ] vLLora backend is running on `localhost:9090`

---

## Phase 1: Project Setup

**Estimated effort:** 15 minutes

### 1.1 Install Dependencies

```bash
cd /Users/anhthuduong/Documents/GitHub/vllora/ui

# Option A: If packages are published
pnpm add @distri/core @distri/react

# Option B: If using local linking
pnpm link ../distri/packages/core ../distri/packages/react
```

### 1.2 Create Directory Structure

```bash
mkdir -p agents
mkdir -p public/agents
mkdir -p src/lib
mkdir -p src/providers
mkdir -p src/hooks
mkdir -p src/components/agent
```

### 1.3 Setup Environment Variables

Create/update `.env.local`:

```bash
# Distri Server URL
VITE_DISTRI_URL=http://localhost:8080

# vLLora Backend URL
VITE_API_URL=http://localhost:9090
```

### 1.4 Checklist

- [ ] Dependencies installed
- [ ] Directory structure created
- [ ] Environment variables configured

---

## Phase 2: Agent Definitions

**Estimated effort:** 30 minutes

### 2.1 Create Main Agent

**File:** `agents/vllora-main-agent.md`

See [agents.md](./agents.md) for full content.

### 2.2 Create UI Agent

**File:** `agents/vllora-ui-agent.md`

See [agents.md](./agents.md) for full content.

### 2.3 Create Data Agent

**File:** `agents/vllora-data-agent.md`

See [agents.md](./agents.md) for full content.

### 2.4 Copy to Public Folder

```bash
cp -r agents/*.md public/agents/
```

### 2.5 Checklist

- [ ] `agents/vllora-main-agent.md` created
- [ ] `agents/vllora-ui-agent.md` created
- [ ] `agents/vllora-data-agent.md` created
- [ ] Agents copied to `public/agents/`

---

## Phase 3: Event Emitter Setup

**Estimated effort:** 15 minutes

### 3.1 Update Event Emitter Types

**File:** `src/utils/eventEmitter.ts`

Add Distri event types to existing emitter.

See [tools.md](./tools.md) for event type definitions.

### 3.2 Checklist

- [ ] Event types added for GET STATE tools (request + response)
- [ ] Event types added for CHANGE UI tools
- [ ] TypeScript types are correct

---

## Phase 4: Tool Handlers

**Estimated effort:** 1 hour

### 4.1 Create UI Tools

**File:** `src/lib/distri-ui-tools.ts`

Implements 11 tools:
- 5 GET STATE tools (request/response pattern)
- 6 CHANGE UI tools (fire-and-forget)

See [tools.md](./tools.md) for full implementation.

### 4.2 Create Data Tools

**File:** `src/lib/distri-data-tools.ts`

Implements 4 tools that reuse existing services:
- `fetch_runs` → `@/services/runs-api.ts`
- `fetch_spans` → `@/services/spans-api.ts`
- `get_run_details` → `@/services/runs-api.ts`
- `fetch_groups` → `@/services/groups-api.ts`

See [tools.md](./tools.md) for full implementation.

### 4.3 Checklist

- [ ] `src/lib/distri-ui-tools.ts` created with 11 tools
- [ ] `src/lib/distri-data-tools.ts` created with 4 tools
- [ ] All tools exported correctly
- [ ] No TypeScript errors

---

## Phase 5: React Integration

**Estimated effort:** 1.5 hours

### 5.1 Create Agent Sync Utility

**File:** `src/lib/agent-sync.ts`

Self-healing agent registration that:
- Verifies agents exist on Distri server
- Re-registers missing agents from `public/agents/`

See [frontend-integration.md](./frontend-integration.md) for implementation.

### 5.2 Create DistriProvider

**File:** `src/providers/DistriProvider.tsx`

Provider component that:
- Initializes Distri client
- Registers tool handlers
- Runs agent sync on mount

See [frontend-integration.md](./frontend-integration.md) for implementation.

### 5.3 Create useVlloraAgent Hook

**File:** `src/hooks/useVlloraAgent.ts`

Hook that provides:
- `sendMessage(text)` - Send message to agent
- `messages` - Chat history
- `isLoading` - Loading state
- `error` - Error state

See [frontend-integration.md](./frontend-integration.md) for implementation.

### 5.4 Update ModalContext

**File:** `src/contexts/ModalContext.tsx`

Add global context initialization for `open_modal` / `close_modal` tools.

See [tools.md](./tools.md) Prerequisites section.

### 5.5 Update TracesPageContext

**File:** `src/contexts/TracesPageContext.tsx`

Add event listeners for UI tools to bridge agent commands to React state.

See [frontend-integration.md](./frontend-integration.md) Section 7.

### 5.6 Checklist

- [ ] `src/lib/agent-sync.ts` created
- [ ] `src/providers/DistriProvider.tsx` created
- [ ] `src/hooks/useVlloraAgent.ts` created
- [ ] `src/contexts/ModalContext.tsx` updated with `setGlobalModalContext`
- [ ] `src/contexts/TracesPageContext.tsx` updated with event listeners
- [ ] No TypeScript errors

---

## Phase 6: UI Components

**Estimated effort:** 1.5 hours

### 6.1 Create AgentPanel

**File:** `src/components/agent/AgentPanel.tsx`

Main floating panel with:
- Chat message display
- Input field
- Loading indicators
- Minimize/maximize

See [ui-design.md](./ui-design.md) for design specs.

### 6.2 Create AgentToggleButton

**File:** `src/components/agent/AgentToggleButton.tsx`

Floating action button to show/hide panel.

### 6.3 Create AgentMessage

**File:** `src/components/agent/AgentMessage.tsx`

Individual message component with:
- User/assistant styling
- Markdown rendering
- Tool call indicators

### 6.4 Create AgentWidget (Optional)

**File:** `src/components/agent/AgentWidget.tsx`

Wrapper component that combines toggle button and panel.

### 6.5 Checklist

- [ ] `AgentPanel.tsx` created
- [ ] `AgentToggleButton.tsx` created
- [ ] `AgentMessage.tsx` created
- [ ] Components render without errors
- [ ] Styling matches design specs

---

## Phase 7: App Integration

**Estimated effort:** 15 minutes

### 7.1 Wrap App with DistriProvider

**File:** `src/App.tsx`

```typescript
import { DistriProvider } from '@/providers/DistriProvider';

function App() {
  return (
    <DistriProvider>
      {/* existing app content */}
    </DistriProvider>
  );
}
```

### 7.2 Add AgentWidget to Layout

Add the agent widget to your main layout so it's accessible from all pages.

### 7.3 Update package.json Scripts

```json
{
  "scripts": {
    "copy-agents": "cp -r agents/ public/agents/",
    "push-agents": "distri --base-url http://localhost:8080 agents push ./agents --all",
    "dev": "pnpm copy-agents && pnpm push-agents && vite",
    "build": "pnpm copy-agents && pnpm push-agents && vite build"
  }
}
```

### 7.4 Checklist

- [ ] App wrapped with DistriProvider
- [ ] AgentWidget added to layout
- [ ] package.json scripts updated

---

## Phase 8: Testing

**Estimated effort:** 1 hour

See [Testing Plan](#testing-plan) section below.

---

## Implementation Order

```
Week 1:
├── Phase 1: Project Setup (Day 1)
├── Phase 2: Agent Definitions (Day 1)
├── Phase 3: Event Emitter Setup (Day 1)
└── Phase 4: Tool Handlers (Day 2)

Week 2:
├── Phase 5: React Integration (Day 1-2)
├── Phase 6: UI Components (Day 2-3)
├── Phase 7: App Integration (Day 3)
└── Phase 8: Testing (Day 3-4)
```

---

## Files Summary

| Phase | File | Action |
|-------|------|--------|
| 1 | `package.json` | Modify (add deps) |
| 1 | `.env.local` | Create/Modify |
| 2 | `agents/vllora-main-agent.md` | Create |
| 2 | `agents/vllora-ui-agent.md` | Create |
| 2 | `agents/vllora-data-agent.md` | Create |
| 3 | `src/utils/eventEmitter.ts` | Modify |
| 4 | `src/lib/distri-ui-tools.ts` | Create |
| 4 | `src/lib/distri-data-tools.ts` | Create |
| 5 | `src/lib/agent-sync.ts` | Create |
| 5 | `src/providers/DistriProvider.tsx` | Create |
| 5 | `src/hooks/useVlloraAgent.ts` | Create |
| 5 | `src/contexts/ModalContext.tsx` | Modify |
| 5 | `src/contexts/TracesPageContext.tsx` | Modify |
| 6 | `src/components/agent/AgentPanel.tsx` | Create |
| 6 | `src/components/agent/AgentToggleButton.tsx` | Create |
| 6 | `src/components/agent/AgentMessage.tsx` | Create |
| 7 | `src/App.tsx` | Modify |

**Total: 10 new files, 5 modified files**

---

# Testing Plan

## Test Environment Setup

### Start All Services

```bash
# Terminal 1: vLLora Backend
cd /Users/anhthuduong/Documents/GitHub/vllora
cargo run
# Verify: http://localhost:9090/health returns OK

# Terminal 2: Distri Server
cd /Users/anhthuduong/Documents/GitHub/distri
export OPENAI_API_KEY=sk-...
distri serve
# Verify: http://localhost:8080/health returns OK

# Terminal 3: vLLora UI
cd /Users/anhthuduong/Documents/GitHub/vllora/ui
pnpm dev
# Verify: http://localhost:5173 loads
```

---

## Test 1: Agent Registration

### 1.1 Verify Agents Registered

```bash
curl http://localhost:8080/agents
```

**Expected:**
```json
["vllora_main_agent", "vllora_ui_agent", "vllora_data_agent"]
```

### 1.2 Verify Self-Healing

1. Delete an agent from Distri server (if API supports)
2. Refresh the vLLora UI page
3. Check browser console for `[Agent Sync]` logs
4. Verify agent is re-registered

**Expected:** Console shows "Registering missing agent: vllora_xxx_agent"

### 1.3 Checklist

- [ ] All 3 agents appear in `/agents` response
- [ ] Self-healing works on page refresh

---

## Test 2: Basic Chat

### 2.1 Open Agent Panel

1. Click the agent toggle button (or press `Cmd/Ctrl + J`)
2. Panel should slide in from right

**Expected:** Panel opens with input field visible

### 2.2 Send Simple Message

1. Type: "Hello, what can you help me with?"
2. Press Enter or click Send

**Expected:**
- Loading indicator appears
- Response from main agent appears
- Response mentions UI and Data capabilities

### 2.3 Checklist

- [ ] Panel opens/closes correctly
- [ ] Messages send successfully
- [ ] Responses render correctly

---

## Test 3: UI Tools (GET STATE)

### 3.1 Test get_current_view

1. Navigate to a trace page with a selected project
2. Ask: "What page am I on?"

**Expected:** Agent responds with current page, project ID, theme

### 3.2 Test get_selection_context

1. Select a span in the trace view
2. Ask: "What span do I have selected?"

**Expected:** Agent responds with the selected span ID

### 3.3 Test get_thread_runs

1. Navigate to a thread with multiple runs
2. Ask: "Show me the runs in this thread"

**Expected:** Agent lists runs with their status and duration

### 3.4 Checklist

- [ ] `get_current_view` returns correct page info
- [ ] `get_selection_context` returns selected span/run
- [ ] `get_thread_runs` lists runs correctly
- [ ] `get_collapsed_spans` returns collapsed IDs
- [ ] `get_span_details` returns span info

---

## Test 4: UI Tools (CHANGE UI)

### 4.1 Test select_span

1. Have a trace with multiple spans visible
2. Ask: "Select span {span_id}" (use a real span ID)

**Expected:**
- Span becomes highlighted in UI
- Selection context updates

### 4.2 Test expand_span / collapse_span

1. Have a collapsed span in view
2. Ask: "Expand span {span_id}"

**Expected:** Span expands to show children

### 4.3 Test open_modal

1. Ask: "Open the settings modal"

**Expected:** Settings modal opens

### 4.4 Test close_modal

1. With a modal open
2. Ask: "Close the modal"

**Expected:** Modal closes

### 4.5 Checklist

- [ ] `select_span` highlights the correct span
- [ ] `select_run` loads run spans
- [ ] `expand_span` expands collapsed span
- [ ] `collapse_span` collapses expanded span
- [ ] `open_modal` opens correct modal
- [ ] `close_modal` closes modal

---

## Test 5: Data Tools

### 5.1 Test fetch_runs

1. Ask: "Show me the last 5 runs"

**Expected:** Agent fetches and displays run information

### 5.2 Test fetch_spans

1. Select a run
2. Ask: "What spans are in this run?"

**Expected:** Agent lists spans with operation names

### 5.3 Test get_run_details

1. Ask: "Give me details about run {run_id}"

**Expected:** Agent shows cost, tokens, duration, errors

### 5.4 Test fetch_groups

1. Ask: "Show me runs grouped by model"

**Expected:** Agent shows aggregated data by model

### 5.5 Checklist

- [ ] `fetch_runs` returns run list
- [ ] `fetch_spans` returns span list
- [ ] `get_run_details` returns detailed info
- [ ] `fetch_groups` returns aggregated data

---

## Test 6: Agent Orchestration

### 6.1 Test Multi-Agent Task

1. Ask: "Analyze the performance of my last run and highlight the slowest span"

**Expected:**
1. Main agent calls data_agent to fetch run data
2. Main agent analyzes the data
3. Main agent calls ui_agent to highlight slowest span
4. UI updates to show the highlighted span

### 6.2 Test Error Investigation

1. Have a run with errors
2. Ask: "Why did my last run fail?"

**Expected:**
1. Agent fetches run with errors
2. Analyzes error messages
3. Provides explanation and suggestions

### 6.3 Checklist

- [ ] Multi-agent coordination works
- [ ] Data flows correctly between agents
- [ ] UI updates match agent commands

---

## Test 7: Error Handling

### 7.1 Test Invalid Tool Parameters

1. Ask agent to select a non-existent span ID

**Expected:** Agent handles error gracefully, reports span not found

### 7.2 Test Network Error

1. Stop the vLLora backend
2. Ask for run data

**Expected:** Agent reports connection error, suggests retry

### 7.3 Test Distri Server Down

1. Stop Distri server
2. Try to send a message

**Expected:** UI shows connection error, retry option

### 7.4 Checklist

- [ ] Invalid parameters handled gracefully
- [ ] Network errors show user-friendly messages
- [ ] Disconnection states are visible

---

## Test 8: UI/UX

### 8.1 Test Keyboard Shortcuts

1. Press `Cmd/Ctrl + J` to toggle panel
2. Press `Escape` to close panel

**Expected:** Panel toggles correctly

### 8.2 Test Responsiveness

1. Resize browser window
2. Check panel on mobile viewport

**Expected:** Panel adapts to screen size

### 8.3 Test Message Scrolling

1. Send multiple messages to create scroll
2. New messages should auto-scroll

**Expected:** Chat scrolls to show latest message

### 8.4 Checklist

- [ ] Keyboard shortcuts work
- [ ] Panel is responsive
- [ ] Auto-scroll works correctly
- [ ] Loading states are visible

---

## Test Matrix

| Test | UI Tools | Data Tools | Orchestration | Error Handling |
|------|----------|------------|---------------|----------------|
| get_current_view | ✓ | | | |
| get_selection_context | ✓ | | | |
| select_span | ✓ | | | |
| open_modal | ✓ | | | |
| fetch_runs | | ✓ | | |
| fetch_spans | | ✓ | | |
| get_run_details | | ✓ | | |
| Multi-agent task | ✓ | ✓ | ✓ | |
| Invalid params | | | | ✓ |
| Network error | | | | ✓ |

---

## Smoke Test Checklist

Quick validation after deployment:

- [ ] Agent panel opens
- [ ] Can send message and receive response
- [ ] UI tools work (select span, open modal)
- [ ] Data tools work (fetch runs)
- [ ] No console errors

---

## Related Documents

- [Architecture](./architecture.md) - System design
- [Agents](./agents.md) - Agent definitions
- [Tools](./tools.md) - Tool implementations
- [Frontend Integration](./frontend-integration.md) - React integration
- [Setup Guide](./setup-guide.md) - Detailed setup steps
- [UI Design](./ui-design.md) - Component design specs
