# Distri Agent Integration for vLLora

This guide explains the Distri agent integration for vLLora - the AI-powered trace analysis assistant.

## Overview

vLLora uses a single Distri agent (`vllora_main_agent`) that helps users:
- **Analyze traces** in real-time and historically
- **Identify issues** in LLM workflows
- **Find bottlenecks** in agent execution
- **Optimize LLM products** based on trace data insights

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              vLLora UI (React)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  AgentPanel  │  │  TracesPage  │  │  UI Tools    │  │   Data Tools    │ │
│  │  (Chat UI)   │──│  Context     │──│  (11 tools)  │  │   (4 tools)     │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────────┘ │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    DistriProvider (@distri/react)                       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼ (A2A Protocol)
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Distri Server                                    │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      vllora_main_agent                                 │ │
│  │  external = ["*"]  →  All 15 tools handled by frontend                │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### Single Agent Architecture

We use a single agent (`vllora_main_agent`) instead of multiple sub-agents because:
- **Simpler implementation** - No orchestration complexity
- **External tools work directly** - Sub-agent delegation doesn't forward external tools
- **Better context awareness** - Single agent sees full conversation history

### All Tools External

The agent uses `external = ["*"]`, meaning:
- **All 15 tools are implemented in vLLora UI** (no Distri repo changes needed)
- Distri server routes tool calls back to frontend
- Frontend executes tools and returns results

### Tool Categories

| Category | Count | Purpose |
|----------|-------|---------|
| **UI Tools** | 11 | Read/control the interface (only work on pages with data) |
| **Data Tools** | 4 | Query backend API directly (work anywhere) |

## Quick Start

```bash
# 1. Ensure @distri packages are installed
cd /Users/anhthuduong/Documents/GitHub/vllora/ui
pnpm install

# 2. Start development
pnpm dev

# Agent is auto-registered on app load via agent-sync.ts
```

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./architecture.md) | System architecture and data flow |
| [Agents](./agents.md) | Main agent definition and prompt |
| [Tools](./tools.md) | All 15 tool implementations |
| [Frontend Integration](./frontend-integration.md) | React hooks and event handling |

## File Structure

```
vllora/ui/
├── public/agents/
│   └── vllora-main-agent.md      # Main agent definition (only agent needed)
├── src/
│   ├── components/agent/
│   │   ├── AgentPanel.tsx         # Chat panel using @distri/react Chat
│   │   ├── AgentToggleButton.tsx  # Floating toggle button
│   │   └── AgentPanelWrapper.tsx  # Manages panel state
│   ├── lib/
│   │   ├── distri-ui-tools.ts     # 11 UI tool handlers
│   │   ├── distri-data-tools.ts   # 4 Data tool handlers
│   │   └── agent-sync.ts          # Runtime agent registration
│   ├── hooks/
│   │   └── useAgentToolListeners.ts  # Basic event listeners for AgentPanel
│   ├── contexts/
│   │   └── TracesPageContext.tsx  # Extended with full event listeners
│   └── utils/
│       └── eventEmitter.ts        # Event types for agent tools
└── docs/distri-agent-integration/ # This documentation
```

## Usage Examples

### Check Errors for Current Thread
```
User: Can you check for errors in this thread?

Agent:
1. Calls get_current_view → gets threadId
2. Calls fetch_runs with threadIds=[threadId] → gets runs from API
3. Analyzes runs for errors
4. Reports findings with suggestions
```

### Analyze Performance
```
User: Why is my agent slow?

Agent:
1. Calls get_current_view → gets context
2. Calls fetch_runs → gets recent runs with timing data
3. Calls get_run_details for slow runs → sees span breakdown
4. Reports bottlenecks with percentages
```

### Cost Analysis
```
User: Show me my costs for today

Agent:
1. Calls fetch_groups with groupBy="time" → gets aggregated data
2. Or fetch_runs with period="last_day"
3. Calculates costs by model
4. Reports breakdown with optimization suggestions
```

## Important Notes

1. **Data Tools for actual analysis** - UI tools like `get_thread_runs` only show visible data
2. **Use `get_current_view` first** - Get threadId before fetching data
3. **UI tools only work on Traces page** - `select_span`, etc. won't work on Chat page
4. **Agent auto-registers on app load** - No manual registration needed
