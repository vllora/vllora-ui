# Lucy Finetune Agent - Architecture

This document describes the technical architecture of the Lucy Finetune Agent system.

---

## System Overview

The Lucy Dataset Agent follows a **3-tier architecture** with tools executing locally in the browser:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React/TypeScript)                    │
│  ┌────────────────────────┐   ┌─────────────────────────────────────┐  │
│  │ LucyDatasetAssistant   │   │    distri-finetune-tools/           │  │
│  │ - Sidebar UI           │   │    - Workflow tools (4)             │  │
│  │ - Auto-analysis        │   │    - Step tools (17)                │  │
│  │ - Quick actions        │   │    - Execute locally in browser     │  │
│  └────────────────────────┘   └─────────────────────────────────────┘  │
│           │                              │                              │
│           ▼                              ▼                              │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │              useFineTuneAgentChat Hook                             ││
│  │  - Injects workflow context into messages                         ││
│  │  - Manages thread/session state (localStorage)                    ││
│  │  - Workflow state in IndexedDB                                    ││
│  └────────────────────────────────────────────────────────────────────┘│
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ WebSocket/HTTP
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       BACKEND - vllora gateway (Rust)                   │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │                    distri.rs                                       ││
│  │  - Downloads distri binary from GitHub releases                   ││
│  │  - Starts distri server as subprocess                             ││
│  │  - Health check at /v1/agents                                     ││
│  └────────────────────────────────────────────────────────────────────┘│
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ Spawns
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  DISTRI SERVER (A2A Protocol Agent Server)              │
│  ┌───────────────────────┐   ┌────────────────────────────────────────┐│
│  │   AgentOrchestrator   │   │     vllora-finetune-agent.md           ││
│  │   - Loads agent defs  │◄──│     - Model: gpt-4.1                   ││
│  │   - Tool execution    │   │     - 21 external tools defined        ││
│  │   - Message routing   │   │     - max_iterations: 20               ││
│  └───────────────────────┘   └────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Agent Definition

**File:** `gateway/agents/finetune/vllora-finetune-agent.md`

| Property | Value |
|----------|-------|
| Name | `vllora_finetune_agent` |
| Model | `gpt-4.1` |
| Temperature | `0.2` |
| Max Iterations | `20` |
| Tool Format | `provider` |
| Total Tools | 21 (4 workflow + 17 step) |

The agent is defined using Distri's markdown-based agent definition format. Key sections:
- **ROLE**: Process-focused finetune assistant
- **MESSAGE CONTEXT**: JSON context structure injected with each message
- **WORKFLOW OVERVIEW**: 7-step pipeline description
- **STEP GUIDANCE**: Detailed instructions for each step
- **RULES**: Critical rules for safe operation

---

### 2. Backend - Distri Integration

**File:** `gateway/src/distri.rs`

The backend manages the Distri binary lifecycle:

```rust
// Binary management functions
download_distri()           // Downloads from GitHub releases
download_distri_background() // Async download in background
start_distri_server()       // Spawns subprocess on specified port
is_distri_running()         // Health check via /v1/agents endpoint

// Binary location
~/.vllora/distri/distri     // Main CLI binary
~/.vllora/distri/distri-server  // Server binary
```

**Platform Support:**
- Linux (amd64, arm64)
- macOS/Darwin (amd64, arm64)

---

### 3. Distri Server (A2A Protocol)

The distri server is an **A2A-compatible agent framework** built in Rust:

**Source:** [github.com/distrihub/distri](https://github.com/distrihub/distri)

```
distri/
├── server/
│   ├── distri-server/        # HTTP server with Actix-web
│   │   └── src/
│   │       ├── agent_server.rs   # Main server entry point
│   │       ├── routes.rs         # API routing (/v1/*)
│   │       └── context.rs        # Request context
│   ├── distri-core/          # Agent orchestration logic
│   ├── distri-stores/        # Storage backends
│   └── distri-plugin-executor/  # Deno-based plugin runtime
└── distrijs/                 # TypeScript client (@distri/core, @distri/react)
```

**Key Components:**
- **AgentOrchestrator**: Loads agent definitions, routes messages, executes tools
- **DistriAgentServer**: HTTP server exposing `/v1/*` endpoints
- **A2A Protocol**: Standard agent-to-agent communication protocol

---

### 3.5. Builtin Tools (from Distri)

The agent has access to two **builtin tools** provided by the Distri framework:

| Tool | Purpose | UI Component |
|------|---------|--------------|
| `final` | Mark agent response as final | N/A |
| `write_todos` | Track sub-tasks with real-time progress updates | `TodosDisplay` from `@distri/react` |

#### write_todos

Allows the agent to track granular sub-tasks. The UI displays a progress bar with task status.

```typescript
// Agent calls:
write_todos({
  "todos": [
    { "content": "Analyze current coverage", "status": "done" },
    { "content": "Generate data for topic A", "status": "in_progress" },
    { "content": "Re-analyze coverage", "status": "open" }
  ]
})
```

**Frontend Integration:**
- Server executes `write_todos` and emits `TodosUpdated` events via A2A protocol
- `chatStateStore` receives events and updates `todos` state
- `LucyChat` subscribes to `useChatStateStore((state) => state.todos)`
- `TodosDisplay` component (from `@distri/react`) renders the todo list

---

### 4. Frontend Components

#### a) LucyDatasetAssistant

**File:** `ui/src/components/datasets/LucyDatasetAssistant.tsx`

Main sidebar component that hosts the Lucy chat interface.

```typescript
// Key features
- Collapsible sidebar (384px expanded, 56px collapsed)
- Uses useFineTuneAgentChat hook for agent communication
- Listens for vllora_lucy_prompt events (external triggers)
- Auto-triggers proactive analysis when opening a dataset
- Quick actions for common workflows
```

**Quick Actions:**
| ID | Icon | Label |
|----|------|-------|
| start-finetune | 🚀 | Start finetune workflow |
| check-status | 📊 | Check workflow status |
| analyze-coverage | 📈 | Analyze topic coverage |
| generate-data | ✨ | Generate synthetic data |
| configure-grader | ⚖️ | Configure evaluation grader |
| run-dry-run | 🧪 | Run dry run validation |

#### b) useFineTuneAgentChat Hook

**File:** `ui/src/hooks/useFineTuneAgentChat.ts`

Custom hook managing agent chat with workflow-aware context.

```typescript
interface UseFineTuneAgentChatReturn {
  agent: any;                    // Distri agent instance
  agentLoading: boolean;
  threadId: string;              // Persisted per dataset
  tools: DistriAnyTool[];        // Finetune tools
  messages: ChatMessage[];
  workflow: FinetuneWorkflowState | null;
  workflowLoading: boolean;
  handleNewChat: () => void;
  refreshWorkflow: () => Promise<void>;
  prepareMessage: (userMessage: string) => DistriMessage;
}
```

**Tools Array Composition:**
```typescript
// In useFineTuneAgentChat.ts
const tools = useMemo<DistriAnyTool[]>(() => [...finetuneTools], []);
```

- `finetuneTools`: All 21 function tools (workflow + step tools)

**Context Injection Pattern:**
```typescript
function buildContextMessage(datasetId, workflow, datasetHasEvaluator) {
  const context = workflowToContext(datasetId, workflow, datasetHasEvaluator);
  return `Context:\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;
}
```

---

### 5. Tools Organization

**Directory:** `ui/src/lib/distri-finetune-tools/`

```
distri-finetune-tools/
├── index.ts              # Main exports, executeFinetuneTool()
├── types.ts              # Shared types (FinetuneContext, result types)
├── workflow/
│   └── index.ts          # 4 workflow control tools
├── steps/
│   ├── index.ts          # Aggregates all step tools
│   ├── generate-topics/  # Topic generation (frontend + backend)
│   │   ├── frontend.ts   # LLM-based generation
│   │   ├── backend.ts    # Template-based generation
│   │   └── index.ts
│   ├── apply-hierarchy.ts
│   ├── categorize-records.ts
│   ├── analyze-coverage.ts
│   ├── generate-synthetic.ts
│   ├── configure-grader.ts
│   ├── test-grader.ts
│   ├── validate-records.ts
│   ├── upload-dataset.ts
│   ├── sync-evaluator.ts
│   ├── run-dry-run.ts
│   ├── start-training.ts
│   ├── check-training-status.ts
│   ├── deploy-model.ts
│   ├── get-dataset-records.ts
│   ├── get-dataset-stats.ts
│   ├── update-record.ts
│   └── helpers.ts
├── topic-tools.ts        # Topic-specific utilities
└── eval-tools.ts         # Evaluation utilities
```

#### Workflow Tools (4)

| Tool | Purpose |
|------|---------|
| `start_finetune_workflow` | Initialize workflow with dataset + training goals |
| `get_workflow_status` | Get current state, step progress, coverage stats |
| `advance_to_step` | Move to next step (with skip support) |
| `rollback_to_step` | Return to previous step via snapshots |

#### Step Tools (17)

| Category | Tools |
|----------|-------|
| **Topics (Step 1)** | `generate_topics`, `apply_topic_hierarchy` |
| **Categorize (Step 2)** | `categorize_records` |
| **Coverage (Step 3)** | `analyze_coverage`, `generate_synthetic_data` |
| **Grader (Step 4)** | `configure_grader`, `test_grader_sample` |
| **Upload/Sync** | `upload_dataset`, `sync_evaluator` |
| **Dry Run (Step 5)** | `run_dry_run` |
| **Training (Step 6)** | `start_training`, `check_training_status` |
| **Deploy (Step 7)** | `deploy_model` |
| **Data Access** | `get_dataset_records`, `get_dataset_stats`, `update_record`, `validate_records` |

---

### 6. State Persistence

**File:** `ui/src/services/finetune-workflow-db.ts`

IndexedDB-based persistence for workflow state.

```typescript
interface FinetuneWorkflowState {
  id: string;
  datasetId: string;
  trainingGoals: string;
  currentStep: FinetuneStep;
  stepStatus: Record<FinetuneStep, StepStatus>;

  // Step-specific results
  inputValidation: {...} | null;
  topicsConfig: {...} | null;
  categorization: {...} | null;
  coverageGeneration: {...} | null;
  graderConfig: {...} | null;
  dryRun: {...} | null;
  training: {...} | null;
  deployment: {...} | null;

  createdAt: number;
  updatedAt: number;
}
```

**Storage Separation:**
- **Workflow DB**: Step progress, metadata, snapshots
- **Dataset DB**: Actual data (records, topicHierarchy, evaluationConfig)

---

### 7. Data Flow

```
┌──────────┐    ┌─────────────────────┐    ┌──────────────┐    ┌──────────────┐
│  User    │───►│  LucyDatasetAssistant│───►│ Distri Server│───►│ GPT-4.1 API  │
│  Input   │    │  + Context Injection │    │  (Binary)    │    │              │
└──────────┘    └─────────────────────┘    └──────────────┘    └──────────────┘
                         │                        │
                         ▼                        ▼
                ┌─────────────────┐      ┌─────────────────┐
                │   IndexedDB     │◄─────│  Tool Execution │
                │ - Datasets      │      │  (Frontend JS)  │
                │ - Workflows     │      └─────────────────┘
                │ - Snapshots     │
                └─────────────────┘
```

**Request Flow:**
1. User sends message in Lucy chat
2. `useFineTuneAgentChat.prepareMessage()` injects workflow context
3. Message sent to Distri server via WebSocket
4. Distri routes to `vllora_finetune_agent`
5. Agent (GPT-4.1) decides which tool(s) to call
6. Tool call sent back to frontend
7. Frontend handler executes tool (reads/writes IndexedDB)
8. Result sent back to agent
9. Agent formulates response
10. Response displayed to user

---

## Key Design Decisions

### 1. Frontend Tool Execution
All 21 tools execute in the browser via JavaScript handlers. This allows:
- Direct access to IndexedDB
- No backend API needed for data operations
- Real-time UI updates via emitter events

### 2. Context Injection Pattern
Every user message is prepended with a JSON context block:
```json
{
  "page": "datasets",
  "current_dataset_id": "...",
  "finetune_workflow": {
    "workflow_id": "...",
    "current_step": "...",
    "coverage": 0.68,
    "has_grader": true
  }
}
```

This gives the agent full awareness without needing separate "get status" calls.

### 3. Flexible Workflow (Quick Path)
Users can start training with just records and an evaluation function:

**Minimum Requirements:**
- Records exist in the dataset
- Evaluation function configured (grader_config)

**Optional Improvements (can skip all):**
- Topics configuration (Step 1)
- Categorization (Step 2)
- Coverage & generation (Step 3)
- Dry run validation (Step 5)
- Deployment (Step 7)

**Quick Path:** `not_started → grader_config → training → completed`

This allows users to quickly see the end-to-end flow. Results may not be optimal, but enables rapid experimentation.

### 4. Snapshot-Based Rollback
Workflow snapshots stored in IndexedDB enable:
- Rolling back to any previous step
- Preserving state for experimentation
- Recovery from failed operations

### 5. Hybrid Tool Execution
- **Frontend tools**: Data operations execute locally in browser for low latency
- **Backend operations**: Training and deployment may call external APIs

---

## Architecture Observations

### Strengths

1. **Low Latency Data Operations** - Tools run locally in browser, reducing round-trips
2. **Workflow State Persistence** - IndexedDB preserves workflow across sessions
3. **Flexible Step Skipping** - Users can skip optional steps (topics → grader, grader → training)
4. **Context Injection** - Every message includes workflow state for agent awareness
5. **Proactive UX** - Auto-analysis when opening datasets

### Potential Considerations

1. **Tool Definition Sync** - Tools defined in both:
   - Agent `.md` file (`[tools].external` array)
   - Frontend TypeScript (`DistriFnTool` definitions)

   These must stay in sync manually.

2. **Browser-Only Execution** - All 21 tools execute in browser. For operations like `start_training` or `deploy_model`, consider:
   - Access to GPU resources
   - Long-running jobs
   - Secure API key handling

3. **Single Model Dependency** - Agent uses `model = "gpt-4.1"` exclusively.

---

## Related Documentation

- [State Machine](./state-machine.md) - Workflow state transitions
- [Overview](./01-overview.md) - High-level feature overview
- [README](./README.md) - Complete design document
- [Re-enabling ask_follow_up](./re-enabling-ask-follow-up.md) - Guide to restore the ask_follow_up UI tool
