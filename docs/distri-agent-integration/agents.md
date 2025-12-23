# Agent Definition

This document describes the vLLora main agent configuration and prompt.

## Overview

vLLora uses a single agent that handles all trace analysis tasks directly:

| Agent | Role | Tools | Model |
|-------|------|-------|-------|
| **vllora_main_agent** | Trace analysis assistant | 15 external | gpt-4.1 |

## Agent Configuration

**File:** `public/agents/vllora-main-agent.md`

```toml
---
name = "vllora_main_agent"
description = "AI assistant for vLLora - analyzes traces, debugs errors, and helps optimize LLM applications"
max_iterations = 20
tool_format = "provider"

[tools]
external = ["*"]

[model_settings]
model = "gpt-4.1"
temperature = 0.3
max_tokens = 4000
---
```

### Configuration Explained

| Field | Value | Purpose |
|-------|-------|---------|
| `name` | `vllora_main_agent` | Unique agent identifier |
| `max_iterations` | `20` | Max tool calls per conversation turn |
| `tool_format` | `provider` | Use provider's native tool format |
| `external = ["*"]` | All tools | All tools handled by frontend |
| `model` | `gpt-4.1` | Primary LLM model |
| `temperature` | `0.3` | Lower for more consistent responses |
| `max_tokens` | `4000` | Allows detailed analysis responses |

## Available Tools (15 total)

### UI Tools (11) - Read/Control Interface

| Tool | Purpose | Works On |
|------|---------|----------|
| `get_current_view` | Get page, projectId, threadId, theme | Any page |
| `get_selection_context` | Get selected run/span IDs | Any page |
| `get_thread_runs` | Get runs visible in UI | Traces page only |
| `get_span_details` | Get selected span info | Traces page only |
| `get_collapsed_spans` | Get collapsed span IDs | Traces page only |
| `open_modal` | Open tools/settings/provider-keys modal | Any page |
| `close_modal` | Close current modal | Any page |
| `select_span` | Highlight a span | Traces page only |
| `select_run` | Select a run | Traces page only |
| `expand_span` | Expand collapsed span | Traces page only |
| `collapse_span` | Collapse a span | Traces page only |

### Data Tools (4) - Query Backend API

| Tool | Purpose | Parameters |
|------|---------|------------|
| `fetch_runs` | Get runs from API | `threadIds`, `runIds`, `modelName`, `period`, `limit` |
| `fetch_spans` | Get spans from API | `threadIds`, `runIds`, `operationNames`, `limit` |
| `get_run_details` | Get full run + spans | `runId` (required) |
| `fetch_groups` | Get aggregated stats | `groupBy`, `bucketSize`, `limit` |

## Agent Prompt Structure

The agent prompt includes:

1. **Role** - Explains the agent's purpose as a trace analysis assistant
2. **Platform Context** - Describes vLLora concepts (runs, spans, threads, projects)
3. **Tool Documentation** - Tables explaining all 15 tools
4. **Workflow Patterns** - Standard analysis flow and common patterns
5. **Response Guidelines** - How to format responses with examples
6. **Important Notes** - Key gotchas and best practices

## Key Workflow Patterns

### Standard Analysis Flow
```
1. get_current_view → Get projectId, threadId, current page
2. fetch_runs/fetch_spans → Query actual data from API
3. Analyze the data for patterns, errors, performance issues
4. Optionally use UI tools to highlight findings
5. Respond with clear, actionable insights
```

### Check Errors for Thread
```
1. get_current_view → get threadId
2. fetch_runs with threadIds=[threadId] → get all runs
3. Look for runs with status="error"
4. For failed runs, use get_run_details to see spans
5. Report findings with possible causes
```

### Performance Analysis
```
1. get_current_view → get context
2. fetch_runs → get runs with duration info
3. For slow runs, get_run_details → see span breakdown
4. Identify slowest spans (usually LLM calls)
5. Report bottlenecks with % of total time
```

## Agent Registration

The agent is automatically registered when the app loads via `agent-sync.ts`:

```typescript
// src/lib/agent-sync.ts
export async function ensureAgentsRegistered(): Promise<void> {
  // Fetches agent definition from /agents/vllora-main-agent.md
  // Registers with Distri server at /api/v1/agents
}
```

This is called from `DistriProvider.tsx` on mount.

## Why Single Agent?

We use one agent instead of sub-agents because:

1. **External tools don't forward through sub-agents** - When the main agent calls a sub-agent via `call_agent`, the sub-agent's external tools aren't visible to the frontend. The tool calls would fail.

2. **Simpler implementation** - No orchestration logic needed

3. **Better context** - Single agent sees full conversation history

4. **Faster responses** - No sub-agent coordination overhead

## Related Documents

- [Tools](./tools.md) - Detailed tool implementations
- [Frontend Integration](./frontend-integration.md) - How tools connect to React
- [Architecture](./architecture.md) - System overview
