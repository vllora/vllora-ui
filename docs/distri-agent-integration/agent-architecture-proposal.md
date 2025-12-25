# vLLora Agent Architecture Proposal

## Current State Analysis

### Current Single Agent: `vllora-debug`

**Location**: `/ui/public/agents/vllora-debug.md`

**Current Tools (17 total)**:
- **UI Read (4)**: `get_selection_context`, `get_thread_runs`, `get_span_details`, `get_collapsed_spans`
- **UI Check (1)**: `is_valid_for_optimize`
- **UI Modify (6)**: `open_modal`, `close_modal`, `select_span`, `select_run`, `expand_span`, `collapse_span`
- **UI Navigate (1)**: `navigate_to_experiment`
- **Experiment Page (4)**: `get_experiment_data`, `apply_experiment_data`, `run_experiment`, `evaluate_experiment_results`
- **Data API (4)**: `fetch_runs`, `fetch_spans`, `get_run_details`, `fetch_groups`

**Problems**:
1. Too many tools (17+) - LLM struggles to choose the right one
2. Context-dependent tools (experiment tools only work on `/experiment` page)
3. Complex workflows requiring multiple tool sequences
4. Prompt manipulation is fragile and can hallucinate

---

## Current Distri Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DISTRI ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                         BACKEND (Rust)                            │   │
│  │                                                                   │   │
│  │  ┌─────────────────┐    ┌─────────────────┐                      │   │
│  │  │ AgentOrchestrator│───▶│   AgentLoop     │                      │   │
│  │  │                 │    │                 │                      │   │
│  │  │ - create_agent  │    │ - process_msg   │                      │   │
│  │  │ - execute_stream│    │ - plan/execute  │                      │   │
│  │  │ - get_tools     │    │ - tool dispatch │                      │   │
│  │  └────────┬────────┘    └────────┬────────┘                      │   │
│  │           │                      │                               │   │
│  │           ▼                      ▼                               │   │
│  │  ┌─────────────────────────────────────────┐                     │   │
│  │  │              Tool Registry               │                     │   │
│  │  │                                         │                     │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌─────────┐ │                     │   │
│  │  │  │ Builtin  │ │ Plugin   │ │ External│ │                     │   │
│  │  │  │  Tools   │ │  Tools   │ │  Tools  │ │                     │   │
│  │  │  └──────────┘ └──────────┘ └─────────┘ │                     │   │
│  │  │                                         │                     │   │
│  │  │  ┌──────────────────────────────────┐  │                     │   │
│  │  │  │  Sub-Agent Tools (AgentTool)     │  │                     │   │
│  │  │  │  call_<agent_name> → delegates   │  │                     │   │
│  │  │  └──────────────────────────────────┘  │                     │   │
│  │  └─────────────────────────────────────────┘                     │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      FRONTEND (TypeScript)                        │   │
│  │                                                                   │   │
│  │  ┌─────────────────┐    ┌─────────────────┐                      │   │
│  │  │   DistriClient  │───▶│     Agent       │                      │   │
│  │  │                 │    │                 │                      │   │
│  │  │ - HTTP/SSE      │    │ - invoke()      │                      │   │
│  │  │ - WebSocket     │    │ - invokeStream()│                      │   │
│  │  └─────────────────┘    └────────┬────────┘                      │   │
│  │                                  │                               │   │
│  │                                  ▼                               │   │
│  │  ┌─────────────────────────────────────────┐                     │   │
│  │  │           @distri/react                  │                     │   │
│  │  │                                         │                     │   │
│  │  │  useAgent()  useChat()  useTools()     │                     │   │
│  │  │                                         │                     │   │
│  │  │  ┌───────────────────────────────────┐ │                     │   │
│  │  │  │         <Chat /> Component         │ │                     │   │
│  │  │  │  - externalTools prop              │ │                     │   │
│  │  │  │  - Tool handlers executed locally  │ │                     │   │
│  │  │  └───────────────────────────────────┘ │                     │   │
│  │  └─────────────────────────────────────────┘                     │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Distri Features for Multi-Agent

1. **`sub_agents` config** - Agent definition can specify sub-agents
2. **`AgentTool`** - Auto-generates `call_<agent_name>` tool for each sub-agent
3. **Context preservation** - Same `thread_id`, new `task_id` for sub-agent calls
4. **Streaming** - Sub-agent events stream through parent

---

## Approach 1: Orchestrator + Sub-Agents (RECOMMENDED)

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    vLLora Multi-Agent Architecture                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                     vllora-orchestrator                           │   │
│  │                     (Main Entry Point)                            │   │
│  │                                                                   │   │
│  │  Role: Route user requests to appropriate specialized agent       │   │
│  │                                                                   │   │
│  │  Tools:                                                          │   │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐    │   │
│  │  │ call_ui_agent   │ │ call_data_agent │ │call_experiment  │    │   │
│  │  │                 │ │                 │ │    _agent       │    │   │
│  │  └────────┬────────┘ └────────┬────────┘ └────────┬────────┘    │   │
│  │           │                   │                   │              │   │
│  └───────────┼───────────────────┼───────────────────┼──────────────┘   │
│              │                   │                   │                  │
│              ▼                   ▼                   ▼                  │
│  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐     │
│  │    ui-agent       │ │   data-agent      │ │ experiment-agent  │     │
│  │                   │ │                   │ │                   │     │
│  │ Responsibility:   │ │ Responsibility:   │ │ Responsibility:   │     │
│  │ - Select spans    │ │ - Fetch runs      │ │ - Get experiment  │     │
│  │ - Expand/collapse │ │ - Fetch spans     │ │ - Apply changes   │     │
│  │ - Navigate        │ │ - Get run details │ │ - Run experiment  │     │
│  │ - Open modals     │ │ - Fetch groups    │ │ - Evaluate results│     │
│  │                   │ │ - Analyze data    │ │ - Compare outputs │     │
│  │ Tools (7):        │ │                   │ │                   │     │
│  │ - select_span     │ │ Tools (4):        │ │ Tools (5):        │     │
│  │ - select_run      │ │ - fetch_runs      │ │ - get_experiment  │     │
│  │ - expand_span     │ │ - fetch_spans     │ │   _data           │     │
│  │ - collapse_span   │ │ - get_run_details │ │ - apply_experiment│     │
│  │ - open_modal      │ │ - fetch_groups    │ │   _data           │     │
│  │ - close_modal     │ │                   │ │ - run_experiment  │     │
│  │ - navigate_to     │ │                   │ │ - evaluate_       │     │
│  │   _experiment     │ │                   │ │   experiment      │     │
│  │                   │ │                   │ │ - is_valid_for    │     │
│  │                   │ │                   │ │   _optimize       │     │
│  └───────────────────┘ └───────────────────┘ └───────────────────┘     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Agent Definitions

#### 1. `vllora-orchestrator.md` (Main Agent)

```toml
---
name = "vllora_orchestrator"
description = "Main orchestrator for vLLora - routes requests to specialized agents"
sub_agents = ["ui_agent", "data_agent", "experiment_agent"]
max_iterations = 20

[model_settings]
model = "gpt-4.1"
temperature = 0.3
max_tokens = 4000
---

# ROLE
You are the orchestrator for vLLora. Your job is to understand user requests
and delegate to the appropriate specialized agent.

# CONTEXT
Every message includes auto-attached context:
- page: Current page (chat, experiment, home)
- projectId, threadId: For data queries
- current_view_detail_of_span_id: Currently viewed span

# AGENTS

## ui_agent
Use for: UI interactions, navigation, selecting spans/runs, opening modals
Examples: "select this span", "navigate to experiment", "open settings"

## data_agent
Use for: Fetching and analyzing trace data, runs, spans, metrics
Examples: "show me errors", "analyze performance", "get run details"

## experiment_agent
Use for: Optimization workflows on the experiment page
Examples: "try a cheaper model", "run the experiment", "compare results"
ONLY use when page is "experiment"

# WORKFLOW

1. Read the context to understand current page and state
2. Analyze user request to determine which agent(s) needed
3. Delegate to ONE agent at a time
4. Synthesize results and respond to user

# RULES
- If page is NOT "experiment", do NOT call experiment_agent
- For multi-step tasks, call agents sequentially
- Always provide a summary after agent completes
```

#### 2. `ui-agent.md`

```toml
---
name = "ui_agent"
description = "Controls vLLora UI - navigation, selection, modals"
max_iterations = 10

[tools]
external = ["*"]  # Gets UI tools from frontend
---

# ROLE
You control the vLLora UI. You can select spans, navigate between pages,
and manage the interface.

# TOOLS
- select_span: Highlight a span in trace view
- select_run: Select a run to view its spans
- expand_span / collapse_span: Toggle span visibility
- open_modal / close_modal: Manage modal dialogs
- navigate_to_experiment: Go to experiment page for a span

# RULES
- Always confirm actions were successful
- If navigation is needed, call navigate_to_experiment ONCE only
```

#### 3. `data-agent.md`

```toml
---
name = "data_agent"
description = "Fetches and analyzes vLLora trace data"
max_iterations = 15

[tools]
external = ["*"]  # Gets data tools from frontend
---

# ROLE
You fetch and analyze trace data from the vLLora backend.

# TOOLS
- fetch_runs: Get runs for a thread/project
- fetch_spans: Get spans with filters
- get_run_details: Get detailed run information with spans
- fetch_groups: Get aggregated metrics

# ANALYSIS PATTERNS

## Error Analysis
1. fetch_runs with error status
2. get_run_details for failed runs
3. Report: what failed, when, possible causes

## Performance Analysis
1. fetch_runs to get durations
2. Identify slow runs
3. get_run_details to see span breakdown
4. Report: bottlenecks, % of time, suggestions

## Cost Analysis
1. fetch_groups with groupBy="time"
2. Calculate totals by model
3. Report: breakdown, trends, optimization suggestions
```

#### 4. `experiment-agent.md`

```toml
---
name = "experiment_agent"
description = "Manages experiment page - optimization, testing, comparison"
max_iterations = 10

[tools]
external = ["*"]  # Gets experiment tools from frontend
---

# ROLE
You help users optimize LLM calls on the experiment page.

# TOOLS
- is_valid_for_optimize: Check if span can be optimized
- get_experiment_data: Get current experiment state
- apply_experiment_data: Modify experiment (model, params, messages)
- run_experiment: Execute the experiment
- evaluate_experiment_results: Compare original vs new

# WORKFLOW

1. get_experiment_data to see current state
2. apply_experiment_data with ONE change (e.g., different model)
3. run_experiment to execute
4. evaluate_experiment_results to compare
5. Report findings with specific numbers
6. Ask user if they want to try another option

# RULES
- Only change ONE thing at a time
- Always run evaluate_experiment_results after run_experiment
- Report concrete metrics: cost %, token %, quality assessment
```

### Implementation in vLLora

```typescript
// AgentPanelWrapper.tsx or Chat component

import { Chat } from '@distri/react';

function AgentPanel() {
  const { page } = useViewContext();

  // Determine which agent to use based on context
  const agentId = 'vllora_orchestrator'; // Always use orchestrator

  // Tools are scoped - only send relevant tools to each sub-agent
  // The orchestrator delegates, sub-agents get their specific tools

  return (
    <Chat
      agentId={agentId}
      externalTools={uiTools}  // All tools available
      // Orchestrator will delegate to sub-agents with appropriate tools
    />
  );
}
```

### Pros
- Clear separation of concerns
- Each sub-agent has focused, smaller tool set
- LLM can reason about delegation
- Easier to test and debug individual agents
- Matches Distri's native architecture

### Cons
- More complex setup (4 agent files)
- Additional latency for delegation
- Need to ensure sub-agents registered in Distri backend

---

## Approach 2: Route-Based Agent Switching

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   Route-Based Agent Switching                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │                     React Router                                │     │
│  │                                                                 │     │
│  │   /chat, /home, /traces          /experiment                   │     │
│  │          │                              │                       │     │
│  └──────────┼──────────────────────────────┼───────────────────────┘     │
│             │                              │                             │
│             ▼                              ▼                             │
│  ┌─────────────────────┐      ┌─────────────────────┐                   │
│  │  vllora-debug       │      │  vllora-experiment  │                   │
│  │  (General Agent)    │      │  (Experiment Agent) │                   │
│  │                     │      │                     │                   │
│  │  Tools (13):        │      │  Tools (5):         │                   │
│  │  - UI tools         │      │  - get_experiment   │                   │
│  │  - Data tools       │      │  - apply_experiment │                   │
│  │  - navigate_to_exp  │      │  - run_experiment   │                   │
│  │                     │      │  - evaluate_results │                   │
│  │                     │      │  - is_valid_for_opt │                   │
│  └─────────────────────┘      └─────────────────────┘                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation

```typescript
// AgentPanelWrapper.tsx

function AgentPanel() {
  const location = useLocation();
  const isExperimentPage = location.pathname === '/experiment';

  // Switch agent based on route
  const agentId = isExperimentPage ? 'vllora_experiment' : 'vllora_debug';

  // Only provide relevant tools
  const tools = isExperimentPage
    ? experimentTools  // 5 experiment-specific tools
    : generalTools;    // 13 general tools (UI + Data)

  return (
    <Chat
      key={agentId}  // Force remount on agent switch
      agentId={agentId}
      externalTools={tools}
    />
  );
}

// Tool definitions
const experimentTools = uiTools.filter(t =>
  ['get_experiment_data', 'apply_experiment_data', 'run_experiment',
   'evaluate_experiment_results', 'is_valid_for_optimize'].includes(t.name)
);

const generalTools = uiTools.filter(t =>
  !['get_experiment_data', 'apply_experiment_data', 'run_experiment',
    'evaluate_experiment_results'].includes(t.name)
);
```

### Agent Definitions

#### `vllora-debug.md` (General - non-experiment pages)
Same as current but remove experiment-specific tools and workflows.

#### `vllora-experiment.md` (Experiment page only)
```toml
---
name = "vllora_experiment"
description = "Experiment page optimization assistant"
max_iterations = 10

[model_settings]
model = "gpt-4.1"
temperature = 0.3
---

# ROLE
You help users optimize LLM calls on the experiment page.
You can modify parameters, run experiments, and compare results.

# TOOLS
- is_valid_for_optimize: Check if optimization is possible
- get_experiment_data: Get current state
- apply_experiment_data: Make changes
- run_experiment: Execute
- evaluate_experiment_results: Compare

# WORKFLOW
1. get_experiment_data
2. apply_experiment_data (ONE change)
3. run_experiment
4. evaluate_experiment_results
5. Report with metrics
```

### Pros
- Simpler implementation (just 2 agents)
- No delegation overhead
- Each agent has focused tool set
- Easy to implement in frontend

### Cons
- Less flexible (hard-coded to routes)
- Conversation context lost when switching agents
- Can't delegate between agents
- Doesn't leverage Distri's sub-agent pattern

---

## Recommendation

### **Approach 1 (Orchestrator + Sub-Agents)** is recommended because:

1. **Native Distri Support**: Uses built-in `sub_agents` and `AgentTool` pattern
2. **Flexibility**: Orchestrator can delegate dynamically based on context
3. **Maintainability**: Each agent is focused and easy to update
4. **Scalability**: Easy to add new specialized agents
5. **Context Preservation**: Same thread, sub-agents share context

### Implementation Steps

1. **Create agent files**:
   - `/ui/public/agents/vllora-orchestrator.md`
   - `/ui/public/agents/ui-agent.md`
   - `/ui/public/agents/data-agent.md`
   - `/ui/public/agents/experiment-agent.md`

2. **Register agents in Distri backend** (if using server-side agents)

3. **Update tool scoping**:
   - Group tools by agent responsibility
   - Pass tool subsets via `externalTools` prop or metadata

4. **Update AgentPanelWrapper**:
   - Use `vllora_orchestrator` as main agent
   - Pass context in message metadata

5. **Test delegation flows**:
   - General queries → data_agent
   - UI interactions → ui_agent
   - Experiment optimization → experiment_agent

---

## Questions to Consider

1. **Where are agents registered?**
   - Server-side (Distri backend) or client-side (metadata)?
   - If server-side, need to deploy agent files to Distri server

2. **How to handle tool scoping?**
   - All tools to orchestrator, filtered to sub-agents?
   - Or different tool sets per agent?

3. **Conversation continuity**:
   - When switching pages, should conversation persist?
   - Should sub-agent results appear in main chat?

4. **Error handling**:
   - What if sub-agent fails?
   - How to surface errors to user?
