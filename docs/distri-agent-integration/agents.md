# Agent Definitions

## Overview

vLLora uses a multi-agent architecture with one orchestrator and three specialized sub-agents:

| Agent | File | Purpose |
|-------|------|---------|
| **vllora_orchestrator** | `vllora-orchestrator.md` | Routes to sub-agents |
| **vllora_ui_agent** | `vllora-ui-agent.md` | UI interactions |
| **vllora_data_agent** | `vllora-data-agent.md` | Data analysis |
| **vllora_experiment_agent** | `vllora-experiment-agent.md` | Experiment optimization |

## 1. vllora_orchestrator

**Location:** `public/agents/vllora-orchestrator.md`

```toml
name = "vllora_orchestrator"
sub_agents = ["vllora_ui_agent", "vllora_data_agent", "vllora_experiment_agent"]
max_iterations = 15
```

**Auto-generated tools:**
- `call_vllora_ui_agent` - Delegate UI tasks
- `call_vllora_data_agent` - Delegate data queries
- `call_vllora_experiment_agent` - Delegate optimization

**Routing logic:**
- UI actions → `call_vllora_ui_agent`
- Data queries → `call_vllora_data_agent`
- Optimization (on `/experiment` page) → `call_vllora_experiment_agent`

## 2. vllora_ui_agent

**Location:** `public/agents/vllora-ui-agent.md`

```toml
name = "vllora_ui_agent"
max_iterations = 8
[tools]
external = ["*"]
```

**Tools (12):**

| Category | Tools |
|----------|-------|
| Selection | `select_span`, `select_run` |
| Visibility | `expand_span`, `collapse_span`, `get_collapsed_spans` |
| Modals | `open_modal`, `close_modal` |
| Navigation | `navigate_to_experiment`, `is_valid_for_optimize` |
| State | `get_selection_context`, `get_thread_runs`, `get_span_details` |

## 3. vllora_data_agent

**Location:** `public/agents/vllora-data-agent.md`

```toml
name = "vllora_data_agent"
max_iterations = 10
[tools]
external = ["*"]
```

**Tools (4):**

| Tool | Purpose |
|------|---------|
| `fetch_runs` | Get runs with filters |
| `fetch_spans` | Get spans with filters |
| `get_run_details` | Get run + all spans |
| `fetch_groups` | Get aggregated metrics |

**Analysis patterns:**
- Error analysis: `fetch_runs` → `get_run_details` → report
- Performance: `fetch_runs` → identify slow → `get_run_details` → bottlenecks
- Cost: `fetch_groups` → breakdown by model

## 4. vllora_experiment_agent

**Location:** `public/agents/vllora-experiment-agent.md`

```toml
name = "vllora_experiment_agent"
max_iterations = 8
[tools]
external = ["*"]
```

**Tools (5):**

| Tool | Purpose |
|------|---------|
| `is_valid_for_optimize` | Check if span can be optimized |
| `get_experiment_data` | Get current state |
| `apply_experiment_data` | Make changes (one at a time) |
| `run_experiment` | Execute (60s timeout) |
| `evaluate_experiment_results` | Compare original vs new |

**Workflow:**
```
1. get_experiment_data     → See current state
2. apply_experiment_data   → ONE change
3. run_experiment          → Execute
4. evaluate_experiment_results → Compare metrics
5. Report with specific numbers
```

## Agent Registration

Agents auto-register on app load via `agent-sync.ts`:

```typescript
const AGENT_NAMES = [
  'vllora_orchestrator',
  'vllora_ui_agent',
  'vllora_data_agent',
  'vllora_experiment_agent',
] as const;
```

The main agent is `vllora_orchestrator` - all user messages go there first.
