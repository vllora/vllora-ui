# Multi-Agent Implementation Plan for vLLora

## Overview

This document details the implementation of **Approach 1: Orchestrator + Sub-Agents** for the vLLora agent system.

**Goal**: Split the current monolithic `vllora_debug` agent (17+ tools) into a focused orchestrator with 3 specialized sub-agents.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    vllora_orchestrator                          │
│                    (Entry Point Agent)                          │
│                                                                 │
│  Auto-generated tools by Distri:                               │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────────┐  │
│  │ call_ui_agent   │ │ call_data_agent │ │call_experiment   │  │
│  │                 │ │                 │ │    _agent        │  │
│  └────────┬────────┘ └────────┬────────┘ └────────┬─────────┘  │
└───────────┼───────────────────┼───────────────────┼─────────────┘
            │                   │                   │
            ▼                   ▼                   ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│   ui_agent        │ │   data_agent      │ │ experiment_agent  │
│   (7 tools)       │ │   (4 tools)       │ │   (5 tools)       │
│                   │ │                   │ │                   │
│ - select_span     │ │ - fetch_runs      │ │ - is_valid_for    │
│ - select_run      │ │ - fetch_spans     │ │   _optimize       │
│ - expand_span     │ │ - get_run_details │ │ - get_experiment  │
│ - collapse_span   │ │ - fetch_groups    │ │   _data           │
│ - open_modal      │ │                   │ │ - apply_experiment│
│ - close_modal     │ │                   │ │   _data           │
│ - navigate_to     │ │                   │ │ - run_experiment  │
│   _experiment     │ │                   │ │ - evaluate_       │
│                   │ │                   │ │   experiment      │
└───────────────────┘ └───────────────────┘ └───────────────────┘
```

---

## File Changes Required

### 1. New Agent Definition Files

Create 4 new files in `/ui/public/agents/`:

| File | Agent Name | Purpose |
|------|------------|---------|
| `vllora-orchestrator.md` | `vllora_orchestrator` | Main entry point, routes to sub-agents |
| `vllora-ui-agent.md` | `vllora_ui_agent` | UI interactions (select, navigate, modals) |
| `vllora-data-agent.md` | `vllora_data_agent` | Data fetching and analysis |
| `vllora-experiment-agent.md` | `vllora_experiment_agent` | Experiment page optimization |

### 2. Modified Files

| File | Changes |
|------|---------|
| `/ui/src/lib/agent-sync.ts` | Add new agent names to `AGENT_NAMES` |
| `/ui/src/lib/distri-ui-tools.ts` | Split tools into agent-specific exports |
| `/ui/src/components/agent/useAgentChat.ts` | Use orchestrator, pass scoped tools |

---

## Detailed Implementation

### Step 1: Create Agent Definition Files

#### 1.1 `/ui/public/agents/vllora-orchestrator.md`

```toml
---
name = "vllora_orchestrator"
description = "Main orchestrator for vLLora - routes requests to specialized agents"
sub_agents = ["vllora_ui_agent", "vllora_data_agent", "vllora_experiment_agent"]
max_iterations = 20
tool_format = "provider"

[model_settings]
model = "gpt-4.1"
temperature = 0.3
max_tokens = 4000
---

# ROLE

You are the vLLora assistant orchestrator. You understand user requests and delegate to specialized agents. You NEVER execute tools directly - you only coordinate sub-agents.

# CONTEXT

Every message includes auto-attached context:
```json
{
  "page": "chat|experiment|home|...",
  "tab": "threads|traces",
  "projectId": "...",
  "threadId": "...",
  "current_view_detail_of_span_id": "..."
}
```

Use this to understand what the user is looking at and route appropriately.

# SUB-AGENTS

## vllora_ui_agent
**Use for**: UI interactions, navigation, visual actions
- Select/highlight spans or runs
- Expand/collapse spans in trace view
- Open/close modals (settings, tools)
- Navigate to experiment page

**Example requests**:
- "select this span"
- "expand all spans"
- "go to the experiment page for this span"
- "open settings"

## vllora_data_agent
**Use for**: Fetching and analyzing trace data
- Query runs and spans from backend
- Analyze errors, performance, costs
- Generate reports and insights

**Example requests**:
- "show me the errors in this thread"
- "why is this run slow?"
- "what's the cost breakdown?"
- "analyze the last 10 runs"

## vllora_experiment_agent
**Use for**: Optimization on the experiment page
- Modify experiment parameters (model, temperature, etc.)
- Run experiments and compare results
- Evaluate quality and cost changes

**IMPORTANT**: Only use when context.page is "experiment"

**Example requests**:
- "try a cheaper model"
- "reduce the temperature"
- "run the experiment"
- "compare the results"

# ROUTING RULES

1. **Check context.page first**
   - If page is "experiment" AND user asks about optimization → `call_vllora_experiment_agent`
   - Otherwise, route based on request type

2. **Route by intent**
   - UI/visual actions → `call_vllora_ui_agent`
   - Data queries/analysis → `call_vllora_data_agent`
   - Optimization/experiments → `call_vllora_experiment_agent`

3. **Multi-step tasks**
   - Call agents sequentially, not in parallel
   - Wait for each agent to complete before calling the next
   - Synthesize results into a unified response

4. **Error handling**
   - If a sub-agent fails, report the error clearly
   - Suggest alternatives if possible

# RESPONSE STYLE

- Be concise and direct
- Report specific metrics (costs, percentages, counts)
- After sub-agent completes, summarize findings
- Suggest logical next steps

# TASK

{{task}}
```

#### 1.2 `/ui/public/agents/vllora-ui-agent.md`

```toml
---
name = "vllora_ui_agent"
description = "Controls vLLora UI - navigation, selection, modals"
max_iterations = 10
tool_format = "provider"

[tools]
external = ["*"]

[model_settings]
model = "gpt-4.1-mini"
temperature = 0.2
max_tokens = 2000
---

# ROLE

You control the vLLora UI. You can select spans, navigate between pages, and manage the interface.

# AVAILABLE TOOLS

## Selection Tools
- `select_span` - Highlight a specific span in the trace view
- `select_run` - Select a run to view its spans

## Visibility Tools
- `expand_span` - Expand a collapsed span to show children
- `collapse_span` - Collapse a span to hide children
- `get_collapsed_spans` - Get list of collapsed span IDs

## Modal Tools
- `open_modal` - Open a modal dialog (tools, settings, provider-keys)
- `close_modal` - Close the current modal

## Navigation Tools
- `navigate_to_experiment` - Navigate to experiment page for a span
  - First call `is_valid_for_optimize` to check if span can be optimized
  - Only call ONCE - do not repeat

## State Tools
- `get_selection_context` - Get currently selected run/span IDs
- `get_thread_runs` - Get runs visible in current thread
- `get_span_details` - Get details of a specific span

# RULES

1. Always confirm actions were successful
2. If asked to navigate to experiment, check `is_valid_for_optimize` first
3. Call `navigate_to_experiment` only ONCE
4. Report what was done clearly

# TASK

{{task}}
```

#### 1.3 `/ui/public/agents/vllora-data-agent.md`

```toml
---
name = "vllora_data_agent"
description = "Fetches and analyzes vLLora trace data"
max_iterations = 15
tool_format = "provider"

[tools]
external = ["*"]

[model_settings]
model = "gpt-4.1-mini"
temperature = 0.2
max_tokens = 3000
---

# ROLE

You fetch and analyze trace data from the vLLora backend. You provide insights about errors, performance, and costs.

# AVAILABLE TOOLS

- `fetch_runs` - Get runs for a thread/project with filters
- `fetch_spans` - Get spans with filters
- `get_run_details` - Get detailed run information including all spans
- `fetch_groups` - Get aggregated metrics (by time, model, etc.)

# ANALYSIS PATTERNS

## Error Analysis
1. `fetch_runs` with status filter for errors
2. `get_run_details` for failed runs to see span breakdown
3. Report: what failed, when, error messages, possible causes

## Performance Analysis
1. `fetch_runs` to get durations
2. Identify slow runs (above average duration)
3. `get_run_details` to see which spans are slow
4. Report: bottlenecks, percentage of time, suggestions

## Cost Analysis
1. `fetch_groups` with groupBy="model" for cost by model
2. Or `fetch_runs` to sum costs across runs
3. Report: total cost, cost per run, cost by model, trends

## Token Usage Analysis
1. `fetch_spans` or `get_run_details` to see token counts
2. Calculate: input vs output tokens, average per call
3. Report: token breakdown, potential optimizations

# RESPONSE FORMAT

Always include:
- **Summary**: High-level finding (1-2 sentences)
- **Details**: Specific metrics and data points
- **Recommendations**: Actionable suggestions

Example:
> **Summary**: Found 3 failed runs in the last hour due to rate limiting.
>
> **Details**:
> - Run abc123: Rate limit at 14:23, after 5 LLM calls
> - Run def456: Rate limit at 14:31, after 3 LLM calls
> - Run ghi789: Rate limit at 14:45, after 8 LLM calls
>
> **Recommendations**:
> 1. Add retry logic with exponential backoff
> 2. Consider using a lower rate tier or batching requests

# TASK

{{task}}
```

#### 1.4 `/ui/public/agents/vllora-experiment-agent.md`

```toml
---
name = "vllora_experiment_agent"
description = "Manages experiment page - optimization, testing, comparison"
max_iterations = 10
tool_format = "provider"

[tools]
external = ["*"]

[model_settings]
model = "gpt-4.1-mini"
temperature = 0.2
max_tokens = 2000
---

# ROLE

You help users optimize LLM calls on the experiment page. You can modify parameters, run experiments, and compare results.

# AVAILABLE TOOLS

- `is_valid_for_optimize` - Check if a span can be optimized
- `get_experiment_data` - Get current experiment state (original and modified data)
- `apply_experiment_data` - Apply changes to the experiment
- `run_experiment` - Execute the experiment (waits up to 60s)
- `evaluate_experiment_results` - Compare original vs new with metrics

# WORKFLOW

Follow this sequence for optimization requests:

```
1. get_experiment_data
   → See current model, messages, parameters

2. apply_experiment_data
   → Make ONE change at a time
   → Example: { "model": "gpt-4o-mini" }

3. run_experiment
   → Execute and wait for results

4. evaluate_experiment_results
   → Get comparison metrics:
   {
     original: { model, cost, tokens },
     new: { model, cost, tokens },
     comparison: { cost_change_percent, tokens_change_percent }
   }

5. Report findings
   → Include specific numbers
   → Compare output quality
   → Ask if user wants to try another option
```

# OPTIMIZATION SUGGESTIONS

## Cost Reduction
- Switch to smaller models: gpt-4o-mini, gpt-3.5-turbo
- Reduce max_tokens if responses are shorter than limit
- Simplify system prompts

## Quality Improvement
- Switch to more capable models: gpt-4, gpt-4o
- Lower temperature for deterministic outputs
- Add more context in system prompt

## Latency Reduction
- Use faster models: gpt-4o-mini
- Enable streaming if not already
- Reduce token counts

# RULES

1. **One change at a time** - Don't batch multiple changes
2. **Always run evaluate** - After run_experiment, always call evaluate_experiment_results
3. **Report specific numbers** - "Cost reduced by 45%" not "cost reduced significantly"
4. **Ask before continuing** - After reporting, ask if user wants to try another option

# EXAMPLE RESPONSE

> I switched the model from gpt-4 to gpt-4o-mini and ran the experiment.
>
> **Results**:
> - Cost: $0.03 → $0.001 (-97%)
> - Tokens: 1500 → 1200 (-20%)
> - Output quality: Similar - both correctly answered the question
>
> Would you like to try another configuration, or is this result satisfactory?

# TASK

{{task}}
```

---

### Step 2: Update Agent Registration

#### 2.1 Modify `/ui/src/lib/agent-sync.ts`

```typescript
// Change AGENT_NAMES to include all agents
const AGENT_NAMES = [
  'vllora_orchestrator',  // Main entry point
  'vllora_ui_agent',       // UI interactions
  'vllora_data_agent',     // Data fetching/analysis
  'vllora_experiment_agent', // Experiment optimization
] as const;

// Update getMainAgentName to return orchestrator
export function getMainAgentName(): string {
  return 'vllora_orchestrator';
}
```

---

### Step 3: Split Tools by Agent

#### 3.1 Modify `/ui/src/lib/distri-ui-tools.ts`

Add tool grouping exports:

```typescript
// ============================================================================
// Tool Groups by Agent
// ============================================================================

// Tools for vllora_ui_agent
export const UI_AGENT_TOOLS: DistriFnTool[] = uiTools.filter(t =>
  [
    'select_span',
    'select_run',
    'expand_span',
    'collapse_span',
    'get_collapsed_spans',
    'open_modal',
    'close_modal',
    'navigate_to_experiment',
    'is_valid_for_optimize',  // Needed before navigate
    'get_selection_context',
    'get_thread_runs',
    'get_span_details',
  ].includes(t.name)
);

// Tools for vllora_experiment_agent
export const EXPERIMENT_AGENT_TOOLS: DistriFnTool[] = uiTools.filter(t =>
  [
    'is_valid_for_optimize',
    'get_experiment_data',
    'apply_experiment_data',
    'run_experiment',
    'evaluate_experiment_results',
  ].includes(t.name)
);
```

#### 3.2 Create `/ui/src/lib/distri-data-tools.ts` grouping

```typescript
// Tools for vllora_data_agent (already in separate file)
export const DATA_AGENT_TOOLS: DistriFnTool[] = dataTools;
// Includes: fetch_runs, fetch_spans, get_run_details, fetch_groups
```

---

### Step 4: Update Tool Passing

#### 4.1 Modify `/ui/src/components/agent/useAgentChat.ts`

The tools need to be passed with metadata indicating which agent they belong to:

```typescript
import { uiTools, UI_AGENT_TOOLS, EXPERIMENT_AGENT_TOOLS } from '@/lib/distri-ui-tools';
import { dataTools, DATA_AGENT_TOOLS } from '@/lib/distri-data-tools';

export function useAgentChat() {
  const agentName = getMainAgentName(); // 'vllora_orchestrator'
  const { agent, loading: agentLoading } = useAgent({ agentIdOrDef: agentName });

  // All tools are still passed to the Chat component
  // The orchestrator doesn't use them directly - it delegates to sub-agents
  // Sub-agents receive their tools via external_tools in metadata
  const tools = useMemo<DistriFnTool[]>(() => {
    // Pass all tools - Distri server handles routing to sub-agents
    return [...uiTools, ...dataTools];
  }, []);

  // ... rest of hook
}
```

**Note**: Distri's backend handles tool scoping automatically when using `sub_agents`. The orchestrator gets `call_<agent_name>` tools, and when it delegates, the sub-agent receives the external tools from the original request.

---

### Step 5: Handle Sub-Agent Results in Chat

Sub-agent results automatically appear in the main chat because:
1. All agents share the same `thread_id`
2. Distri streams events from sub-agents through the parent
3. The Chat component renders all messages in the thread

No additional changes needed for conversation continuity.

---

### Step 6: Error Handling

Errors from sub-agents are already surfaced through the event stream. The orchestrator prompt instructs it to report errors clearly.

For additional error handling, we can add to the orchestrator prompt:

```markdown
# ERROR HANDLING

If a sub-agent fails:
1. Report the error clearly to the user
2. Explain what was attempted
3. Suggest alternatives or retry options

Example:
> The data_agent encountered an error while fetching runs:
> "Rate limit exceeded"
>
> This usually means too many requests in a short time.
> Would you like me to:
> 1. Wait and retry in a few seconds
> 2. Fetch a smaller batch of data
```

---

## Testing Plan

### 1. Agent Registration
- [ ] All 4 agents appear in Distri server at `/api/v1/agents`
- [ ] `vllora_orchestrator` has `call_*` tools for sub-agents

### 2. Routing Tests
| User Request | Expected Agent | Expected Tools Used |
|-------------|---------------|-------------------|
| "select this span" | ui_agent | select_span |
| "show me errors" | data_agent | fetch_runs |
| "try a cheaper model" (on experiment page) | experiment_agent | apply_experiment_data, run_experiment, evaluate |
| "navigate to experiment" | ui_agent | is_valid_for_optimize, navigate_to_experiment |

### 3. Context Tests
- [ ] Orchestrator correctly reads page context
- [ ] Experiment agent only called when page="experiment"
- [ ] Thread history preserved across agent switches

### 4. Error Tests
- [ ] Sub-agent timeout shows clear error
- [ ] Invalid tool calls show helpful message
- [ ] Network errors gracefully handled

---

## Migration Path

### Phase 1: Add New Agents (Non-Breaking)
1. Create all 4 agent files in `/ui/public/agents/`
2. Add to `AGENT_NAMES` in agent-sync.ts
3. Keep `vllora_debug` as fallback

### Phase 2: Switch to Orchestrator
1. Update `getMainAgentName()` to return `vllora_orchestrator`
2. Test all workflows
3. Monitor for issues

### Phase 3: Cleanup
1. Remove `vllora-debug.md` (or keep as backup)
2. Remove old tool grouping code
3. Update documentation

---

## File Checklist

### New Files
- [ ] `/ui/public/agents/vllora-orchestrator.md`
- [ ] `/ui/public/agents/vllora-ui-agent.md`
- [ ] `/ui/public/agents/vllora-data-agent.md`
- [ ] `/ui/public/agents/vllora-experiment-agent.md`

### Modified Files
- [ ] `/ui/src/lib/agent-sync.ts` - Add agent names, update main agent
- [ ] `/ui/src/lib/distri-ui-tools.ts` - Add tool group exports
- [ ] `/ui/src/lib/distri-data-tools.ts` - Add tool group export

### Optional Files
- [ ] `/ui/src/components/agent/useAgentChat.ts` - Only if tool scoping needed

---

## Open Questions

1. **Model Selection**: Should sub-agents use cheaper models (gpt-4.1-mini) than orchestrator (gpt-4.1)?
   - Recommendation: Yes, sub-agents do focused tasks and can use smaller models

2. **Tool Duplication**: Some tools like `is_valid_for_optimize` are used by both ui_agent and experiment_agent
   - Recommendation: OK to include in both, or move to orchestrator level

3. **Fallback**: If sub-agent doesn't respond, should orchestrator retry or fail?
   - Recommendation: Fail with clear error, let user decide to retry
