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
│  │ - Auto-analysis        │   │    - Step tools (47)                │  │
│  │ - Quick actions        │   │    - Execute locally in browser     │  │
│  └────────────────────────┘   └─────────────────────────────────────┘  │
│           │                              │                              │
│           ▼                              ▼                              │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │              useFineTuneAgentChat Hook                             ││
│  │  - Injects workflow context into messages                         ││
│  │  - Session catch-up: detects unreviewed eval jobs on mount        ││
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
│  │   - Tool execution    │   │     - 24 external + 3 builtin tools    ││
│  │   - Message routing   │   │     - max_iterations: 30               ││
│  │   - Sub-agent mgmt    │   │     - 3 sub-agents (topics, workflow,  ││
│  │                       │   │       data_generation)                  ││
│  └───────────────────────┘   └────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Agent Definition

**Folder:** `gateway/agents/finetune/` — contains 4 markdown-based agent definitions that the Distri server's AgentOrchestrator loads to instantiate the multi-agent system.

**Orchestrator:** `vllora-finetune-agent.md`

| Property | Value |
|----------|-------|
| Name | `vllora_finetune_agent` |
| Model | `gpt-4.1` |
| Temperature | `0.2` |
| Max Iterations | `30` |
| Tool Format | `provider` |
| External Tool Timeout | `600s` (10 min for user responses) |
| Sub-Agents | `finetune_topics`, `finetune_workflow`, `data_generation` |
| Builtin Tools | 3 (`final`, `write_todos`, `transfer_to_agent`) |
| External Tools | 24 (`ask_follow_up`, `get_workflow_status`, `get_dataset_state`, `get_dataset_records`, `update_objective`, `analyze_knowledge_sources`, `search_knowledge`, `generate_topics`, `generate_grader`, `propose_plan`, `adjust_plan`, `save_plan`, `execute_plan`, `update_plan_markdown`, `apply_topic_hierarchy`, `generate_initial_data`, `configure_grader`, `upload_dataset`, `run_evaluation`, `start_training`, `start_finetune_workflow`, `advance_to_step`, `update_dataset_readme`, `analyze_evaluation`, `analyze_training`, `get_training_metrics`) |

The orchestrator is the main agent users interact with. It handles plan-first routing (detecting when to create plans from knowledge sources), delegates specialized work to sub-agents via `transfer_to_agent`, and calls some tools directly (plan system, knowledge analysis, dataset access).

Key prompt sections:
- **ROLE**: Proactive finetune orchestrator
- **CRITICAL RULES**: Plan-first triggers, ask_follow_up usage, delegation rules
- **SUB-AGENTS**: When/how to delegate to each sub-agent
- **DATA FORMAT**: Unified record structure (user + assistant + score, output empty for RFT rollout)

---

### 1.5. Sub-Agent Architecture

The orchestrator delegates specialized tasks to 3 sub-agents via `transfer_to_agent`. Each sub-agent has its own tool set, model settings, and behavioral prompt.

| Sub-Agent | File | Purpose | External Tools |
|-----------|------|---------|---------------|
| `finetune_topics` | `finetune-topics-agent.md` | Topic hierarchy generation, display, manipulation | 5: `generate_topics`, `apply_topic_hierarchy`, `adjust_topic_hierarchy`, `get_topic_hierarchy`, `get_dataset_records` |
| `finetune_workflow` | `finetune-workflow-agent.md` | Workflow operations — data generation, grading, training, deployment, skill packaging, evaluation analysis, inner loop iteration | 28: all workflow control + data ops + grader + training + packaging + evaluation analysis + analyze_evaluation tools |
| `data_generation` | `data-generation-agent.md` | Interactive data gen with knowledge sources, previews, iterative refinement | 12: knowledge source tools + generation tools + dataset access |

**Delegation Flow:**
```
vllora_finetune_agent (Orchestrator)
    │
    │── Handles directly: plan system, knowledge analysis, ask_follow_up
    │
    ├── transfer_to_agent("finetune_topics", "Generate topics...")
    │       └── generate_topics, apply_topic_hierarchy, adjust_topic_hierarchy
    │
    ├── transfer_to_agent("finetune_workflow", "Start training...")
    │       └── start_finetune_workflow, advance_to_step, start_training,
    │           get_evaluation_details, log_iteration, mark_job_reviewed, etc.
    │
    └── transfer_to_agent("data_generation", "Generate training data...")
            └── generate_preview, generate_synthetic_data, upload_knowledge_source, etc.
```

**Design:**
- **Separation of concerns**: Each sub-agent is specialized for its domain
- **Smaller context windows**: Sub-agents only load relevant tools and instructions
- **Cleaner orchestration**: Main agent focuses on plan-first routing and UX guidance
- **Tool overlap**: Some tools appear on multiple agents (e.g., `get_dataset_records` on orchestrator + topics + data_generation) to allow each agent to access what it needs

**Agent Definition Files** (`gateway/agents/finetune/`):
- `vllora-finetune-agent.md` — Orchestrator (24 external + 3 builtin tools)
- `finetune-topics-agent.md` — Topics specialist (5 external tools)
- `finetune-workflow-agent.md` — Workflow executor (29 external tools, inner loop + outer loop analysis)
- `data-generation-agent.md` — Data generation specialist (12 external tools)

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

The agent has access to **builtin tools** provided by the Distri framework:

| Tool | Purpose | UI Component |
|------|---------|--------------|
| `final` | Mark agent response as final | N/A |
| `write_todos` | Track sub-tasks with real-time progress updates | `TodosDisplay` from `@distri/react` |
| `transfer_to_agent` | Delegate task to a sub-agent | N/A (server-side routing) |

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
- Responsive sidebar (340px standard, 384px on >1536px screens, auto-collapses on <1024px)
- Uses useFineTuneAgentChat hook for agent communication
- Listens for vllora_lucy_prompt events (external triggers)
- Auto-triggers proactive analysis when opening a dataset
- Quick actions for common workflows
```

**Quick Actions:**
| ID | Icon | Label |
|----|------|-------|
| start-finetune | 🚀 | Start training setup |
| check-status | 📊 | Check progress |
| analyze-coverage | 📈 | Check data variety |
| generate-data | ✨ | Create more training examples |
| configure-grader | ⚖️ | Set up quality scoring |
| run-dry-run | 🧪 | Test before training |

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
const tools = useMemo<DistriAnyTool[]>(
  () => [...finetuneTools, createAskFollowUpTool()],
  []
);
```

- `finetuneTools`: All 51 function tools (4 workflow + 47 step tools)
- `createAskFollowUpTool()`: UI tool for presenting options to users

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
│   ├── index.ts                  # Aggregates all 43 step tools
│   ├── generate-topics/          # Topic generation (frontend + backend)
│   │   ├── frontend.ts           # LLM-based generation
│   │   ├── backend.ts            # Template-based generation
│   │   └── index.ts
│   ├── propose-plan/             # Plan generation & adjustment
│   │   ├── handler.ts            # Validates, persists, emits plan
│   │   ├── tool.ts               # Tool definition
│   │   ├── types.ts              # Plan type definitions
│   │   ├── grader-template.ts    # LLM-as-judge evaluator template
│   │   ├── adjust-plan.ts        # Plan adjustment via user feedback
│   │   └── index.ts
│   ├── shared/                   # Shared utilities
│   │   ├── index.ts
│   │   └── knowledge-context.ts  # Knowledge source context builder
│   ├── knowledge-sources.ts      # 4 knowledge source tools
│   ├── semantic-pdf-extractor.ts # LLM-assisted PDF content extraction
│   ├── pdf-native-extractor.ts   # Basic pdfjs-dist text extraction
│   ├── analyze-knowledge-sources.ts  # LLM analysis of uploaded docs
│   ├── apply-hierarchy.ts
│   ├── adjust-hierarchy.ts       # Natural language topic adjustments
│   ├── topic-manipulation.ts     # get_topic_hierarchy tool
│   ├── categorize-records.ts
│   ├── analyze-coverage.ts
│   ├── generate-synthetic.ts
│   ├── generate-initial-data.ts  # Generate data for empty datasets
│   ├── generate-record-variants.ts  # Generate variations of existing records
│   ├── generate-preview.ts       # Preview generation before committing
│   ├── configure-grader.ts
│   ├── generate-grader.ts        # LLM-based grader criteria + script generation
│   ├── test-grader.ts
│   ├── validate-records.ts
│   ├── upload-dataset.ts
│   ├── sync-evaluator.ts
│   ├── run-dry-run.ts
│   ├── start-training.ts
│   ├── check-training-status.ts
│   ├── deploy-model.ts
│   ├── get-dataset-records.ts
│   ├── get-dataset-state.ts      # Dataset state + computed stats
│   ├── update-record.ts
│   ├── update-objective.ts       # Update dataset objective/goals
│   ├── update-dataset-readme.ts  # Agent-authored README tool
│   ├── save-plan.ts              # Persist plan to IndexedDB
│   ├── execute-plan.ts           # Registry-based plan execution (deprecated)
│   ├── update-plan-markdown.ts   # Agent updates plan display during execution
│   ├── plan-step-normalization.ts  # Step ID normalization utilities
│   ├── execution-state-store.ts  # In-memory execution cache (write-through to IndexedDB)
│   ├── proposed-plan-store.ts    # IndexedDB plan persistence with lifecycle status tracking
│   ├── generate-skill-package.ts  # Assemble skill package ZIP (zero LLM calls)
│   ├── download-skill-package.ts  # Browser download of generated ZIP
│   ├── stockfish-tools.ts        # Chess-specific tools (conditional)
│   ├── stockfish-service.ts      # Stockfish engine integration
│   └── helpers.ts
├── todos/
│   └── index.ts          # Todo list tool definitions
├── ui/
│   └── index.ts          # UI-specific tools (ask_follow_up)
└── eval-tools.ts         # Evaluation utilities
```

#### Workflow Tools (4)

| Tool | Purpose |
|------|---------|
| `start_finetune_workflow` | Initialize workflow with dataset + training goals |
| `get_workflow_status` | Get current state, step progress, coverage stats |
| `advance_to_step` | Move to next step (with skip support) |
| `rollback_to_step` | Return to previous step via snapshots |

#### Step Tools (43)

| Category | Tools |
|----------|-------|
| **Topics (Step 1)** | `generate_topics`, `apply_topic_hierarchy`, `adjust_topic_hierarchy`, `get_topic_hierarchy` |
| **Categorize (Step 2)** | `categorize_records` |
| **Coverage (Step 3)** | `analyze_coverage`, `generate_synthetic_data`, `generate_initial_data`, `generate_record_variants`, `generate_preview` |
| **Knowledge Sources** | `upload_knowledge_source`, `list_knowledge_sources`, `extract_topics_from_source`, `search_knowledge`, `analyze_knowledge_sources` |
| **Grader (Step 4)** | `configure_grader`, `generate_grader`, `test_grader_sample` |
| **Upload/Sync** | `upload_dataset`, `sync_evaluator` |
| **Dry Run (Step 5)** | `run_evaluation` |
| **Skill Packaging (Step 5b)** | `generate_skill_package`, `download_skill_package` |
| **Training (Step 6)** | `start_training`, `check_training_status` |
| **Deploy (Step 7)** | `deploy_model` |
| **Plan** | `propose_plan`, `adjust_plan`, `save_plan`, `execute_plan` (deprecated), `update_plan_markdown` |
| **Data Access** | `get_dataset_records`, `get_dataset_state`, `update_record`, `update_objective`, `validate_records` |
| **Eval Analysis** | `get_evaluation_details`, `log_iteration`, `get_iteration_history`, `mark_job_reviewed`, `analyze_evaluation`, `analyze_training` |
| **Documentation** | `update_dataset_readme` (agent-authored) |

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
  skillPackaging: {...} | null;
  training: {...} | null;
  deployment: {...} | null;

  createdAt: number;
  updatedAt: number;
}
```

**Storage Separation (3 IndexedDB databases):**
- **`vllora-finetune`** (v7): Step progress, metadata, snapshots, dry run jobs (with `reviewedByAgent` flag), job evaluation cache (with `scoresPersisted` tracking), plans (with lifecycle status: proposed → approved → executing → completed/failed), evaluation jobs index, iteration state
- **`vllora-datasets`**: Actual data (records, topicHierarchy, evaluationConfig)
- **`vllora-knowledge-sources`**: Uploaded documents with extracted content

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
                │ - Knowledge Src │
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
All 51 tools execute in the browser via JavaScript handlers. This allows:
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
   - Agent `.md` files (`[tools].external` array in each sub-agent)
   - Frontend TypeScript (`DistriFnTool` definitions)

   These must stay in sync manually across 4 agent definition files.

2. **Browser-Only Execution** - All 51 tools execute in browser. For operations like `start_training` or `deploy_model`, consider:
   - Access to GPU resources
   - Long-running jobs
   - Secure API key handling

3. **Single Model Dependency** - Agent uses `model = "gpt-4.1"` exclusively.

---

## VS Code-Style UI Architecture

The UI follows a **VS Code with Copilot Chat** pattern: an AI assistant (Lucy) in the sidebar orchestrates the workflow while the workspace displays artifacts as dynamic editor tabs.

### Layout

```
┌──────┬──────────────────────────────┬──────────────────────────────────────┐
│ App  │ SIDEBAR (340px)              │ WORKSPACE                            │
│ Side │ [Explorer] [Lucy] tab strip  │ [readme.md ×] [plan.md ×] [data ×]  │
│ bar  │                              │                                      │
│      │ Explorer: VS Code file tree  │ Dynamic, closeable editor tabs       │
│      │ Lucy: Flat IDE chat panel    │ Content routed by virtual file path  │
│      │                              │                                      │
│ 16px │          340px               │           flex-1                     │
└──────┴──────────────────────────────┴──────────────────────────────────────┘
```

### Sidebar: Explorer + Lucy Chat

The sidebar has a 2-tab strip switching between Explorer and Lucy views:

- **Explorer** (`DatasetExplorer.tsx`) — VS Code file-tree showing the dataset as a virtual project. Every item maps to existing data in IndexedDB/contexts. Clicking a file opens it as a workspace tab.
- **Lucy** (`LucyDatasetAssistant.tsx`) — Flat IDE-panel chat (not bubble-style). Left-aligned, compact 8px spacing, left-border accent for tool calls, ~6-8 messages visible.

**Explorer file tree structure:**
```
📄 readme.md          → DatasetReadmeViewer
📄 plan.md            → PlanPreview / PlanEditor
📄 tasks.md           → TasksViewer (reads chat todos)
📄 logs.md            → LogsViewer (aggregated timeline)
📁 documents/         → KnowledgeSourcesPanel
📁 topics/            → RecordsTable (filtered by topic)
📁 evaluations/       → EvaluationConfigPanel + DryRunActivityView
📁 finetune/          → JobDetailPanel
📁 quick-stats/       → DatasetOverviewCard sub-views
```

**Key sidebar files:**
| File | Purpose |
|------|---------|
| `src/components/datasets/sidebar/DatasetExplorer.tsx` | VS Code file tree, reads from 5+ contexts |
| `src/components/datasets/sidebar/FileTreeItem.tsx` | Recursive tree item |
| `src/components/datasets/sidebar/SidebarTabStrip.tsx` | `[Explorer] [Lucy]` tab strip |
| `src/components/datasets/sidebar/LogsViewer.tsx` | Activity log timeline |
| `src/components/datasets/sidebar/TasksViewer.tsx` | Lucy's task checklist |

### Workspace: Dynamic Editor Tabs

Fixed navigation tabs (Overview, Data, Evaluation, Fine-tune, Deploy) were replaced by dynamic, closeable editor tabs. Clicking a file in Explorer opens it as a tab.

**Key workspace files:**
| File | Purpose |
|------|---------|
| `src/components/datasets/WorkspaceTabManager.tsx` | Tab bar with open/close/preview/pin, localStorage persistence |
| `src/components/datasets/TabContentRouter.tsx` | Maps virtual file path → existing content component |
| `src/contexts/WorkspaceTabsContext.tsx` | React Context for open/active/pinned tab state |

### Terminology Standardization

| Concept | Standard Term | Code-Internal |
|---------|--------------|---------------|
| Quality scoring | **Evaluation** | `evalScript`, `grader` |
| Training jobs | **Fine-tune** | `finetuneJob` |
| Reference files | **Documents** | `knowledgeSource` |
| AI records | **Generated** (badge/filter) | `source: 'generated'` |
| Setup process | **Plan** | `Plan` |

### Chat Panel Design

Lucy Chat uses a **flat IDE-panel style** (not messaging bubbles):

| Aspect | Design |
|--------|--------|
| Alignment | Everything left-aligned |
| Containers | No bubbles — content flows directly |
| Avatars | Tiny inline icon (14px) or text label |
| Spacing | Compact (8px between messages) |
| Tool calls | Left-border accent rows |
| Input | Rounded-lg with simple border focus |
| Density | ~6-8 messages visible |

### Architectural Decision: What Changed vs Stayed

**Unchanged** (no modifications needed):
- Lucy agent prompt + tools (gateway)
- Distri server + @distri/react + @distri/core packages
- IndexedDB data models
- Tool execution pipeline (`distri-finetune-tools/`)
- All React contexts

**Changed** (frontend only):
- Sidebar → Explorer panel + Lucy chat with tab strip
- Fixed tabs → dynamic workspace editor tabs
- Sheet overlays (ReadmeDrawer, DocsDrawer) → workspace tabs
- New `WorkspaceTabsContext` for tab state
- Event semantics updated: `vllora_switch_tab` and `vllora_open_drawer` map to tab paths

---

## Datasets UI Components

### Dataset Grid Page

The datasets listing page uses a responsive card grid layout with search, filter, and sort capabilities.

**Component Tree:**
```
DatasetsGrid
├── DatasetsListHeader
│   ├── Search Input (with lucide Search icon)
│   ├── Segmented Filter Tabs (All | Draft | Processing | Completed)
│   ├── DatasetSortDropdown (8 sort options)
│   └── Count label (e.g. "12 datasets")
├── DatasetCard (per dataset)
│   ├── Top accent bar (color by state)
│   ├── Name (with tooltip, click to select)
│   ├── Objective excerpt (with tooltip)
│   ├── Stat chips (records, topics, docs)
│   ├── State badge + timestamp
│   └── Action dropdown (Rename, Import, Download, Delete)
├── AddDatasetCard (link to /datasets/new)
├── DatasetsEmptyState
├── DatasetsNoResultsState
├── DeleteConfirmationDialog
└── IngestDataDialog
```

**Key Files:**
| File | Purpose |
|------|---------|
| `datasets/table/DatasetsGrid.tsx` | Main grid container, state management, filter/sort logic |
| `datasets/table/DatasetsListHeader.tsx` | Search bar, segmented filter tabs, sort dropdown, count |
| `datasets/table/DatasetSortDropdown.tsx` | Standalone sort dropdown (8 options), exports `DatasetSort` types |
| `datasets/table/DatasetCard.tsx` | Card with gradient bg, accent bar, stat chips, tooltips, action menu |
| `datasets/table/AddDatasetCard.tsx` | Dashed-border "New Dataset" card |
| `datasets/table/DatasetsEmptyState.tsx` | Empty state when no datasets exist |
| `datasets/table/DatasetsNoResultsState.tsx` | Empty state when search/filter returns no results |

### Dry Run Polling & Recovery

The `dry-run-polling-manager.ts` singleton manages background polling for dry run evaluation jobs with built-in failure detection and workflow state synchronization.

**Polling Configuration:**
| Constant | Value | Description |
|----------|-------|-------------|
| `POLL_INTERVAL_MS` | 6000ms | Interval between backend status checks |
| `MAX_POLL_ATTEMPTS` | 120 | Maximum polls before timeout (~12 min) |
| `MAX_CONSECUTIVE_ERRORS` | 5 | Consecutive failures before marking job failed |

**Failure Detection:**
- **Timeout**: After 120 poll attempts (~12 minutes), the job is marked failed and `markStepFailed()` is called on the workflow
- **Consecutive errors**: After 5 consecutive poll failures (network issues, server down), the job is marked failed with workflow step sync
- **Backend failure**: If the backend reports `status: 'failed'`, the job is immediately marked failed

**Workflow State Sync:**
- **On success**: The polling manager populates `workflow.dryRun` with summary stats (mean, std, percentAboveZero, percentPerfect, verdict, sampleResults, recommendations) via `updateStepData()`
- **On failure**: The polling manager calls `markStepFailed()` which sets `stepStatus.dry_run = 'failed'` in the workflow state, ensuring the UI reflects the failure

**Cancel Support:**
The dry run dialog's running view displays a cancel button that calls `cancelDryRun()` on the polling manager, which stops polling and marks the job as `cancelled`. A compact status indicator in the `EvaluationConfigPanel` header also shows running progress and links to the dialog.

**DryRunDialog Fallback:**
If the dialog is in "running" view but the running job disappears without a completed job being available (e.g., job cancelled or failed externally), the dialog falls back to the "config" view so the user can start a new dry run.

### Finetune Score Persistence

The `FinetuneJobsContext` manages persisting finetune evaluation scores to individual records after training jobs complete.

**Flow:**
1. On mount, the context fetches evaluations for ALL completed finetune jobs (not just the latest)
2. For each completed job with results, it checks the `scoresPersisted` flag on the `CachedJobEvaluation` entry in IndexedDB
3. If not yet persisted, it calls `persistFinetuneScoresToRecords()` which computes average scores across epochs and writes them to each record's `evaluation` field
4. Only after records are actually updated (`persisted > 0`), the `scoresPersisted` flag is set to `true` via `markJobScoresPersisted()`
5. A `vllora_dataset_refresh` event (with `datasetId`) is emitted to refresh the UI

**Key design decisions:**
- The `scoresPersisted` flag is stored in IndexedDB (on the `CachedJobEvaluation` entry), not in volatile React state. This ensures persistence tracking survives page refreshes.
- Scores are persisted for ALL completed jobs, not just the latest, ensuring no evaluation data is lost.
- The flag is only set after confirming records were actually updated, preventing false-positive persistence tracking.

**Key Files:**
| File | Purpose |
|------|---------|
| `contexts/FinetuneJobsContext.tsx` | Orchestrates score persistence on mount for all completed jobs |
| `services/datasets-db.ts` | `persistFinetuneScoresToRecords()` writes avg scores to records |
| `services/finetune-workflow-db.ts` | `isJobScoresPersisted()` / `markJobScoresPersisted()` track persistence state |

### Quality Indicators

Per-record quality scores displayed in the records table. Scores come from two sources: dry run evaluations and finetune job evaluations.

**Component Tree:**
```
RecordsTableHeader
├── ... (existing columns)
└── "Quality" column header

RecordRow
├── ... (existing cells)
└── QualityIndicator
    └── Score badge (colored dot + number with tooltip)
```

**Key Files:**
| File | Purpose |
|------|---------|
| `datasets/records-table/cells/QualityIndicator.tsx` | Score badge (emerald/amber/red based on 0-1 score) |
| `datasets/records-table/RecordRow.tsx` | Renders QualityIndicator between Stats and Actions columns |
| `datasets/records-table/RecordsTableHeader.tsx` | "Quality" column header |
| `datasets/table-columns.ts` | Column width: `quality: "w-14 shrink-0"` |
| `services/dry-run-polling-manager.ts` | Persists dry run per-row scores via `updateRecordEvaluation()`, syncs workflow state on completion/failure |
| `contexts/FinetuneJobsContext.tsx` | Persists finetune job scores via `persistFinetuneScoresToRecords()` |
| `types/dataset-types.ts` | `DatasetEvaluation` type (`score`, `feedback`, `evaluatedAt`) |

### Canvas View Enhancements (P0 Implementation)

The Canvas view was enhanced with search/filter, conversation previews, loading states, and semantic theming:

**Canvas Search & Filter (P0-2)**

`TopicCanvasContext` manages canvas-level filter state:
- `searchQuery` / `setSearchQuery` — text search across records
- `scoreFilter` / `setScoreFilter` — filter by evaluation score (`ScoreFilter = "all" | "high" | "low" | "unevaluated"`)
- `filteredRecordsByTopic` — computed filtered records per topic (null when no filter active)
- `isFilterActive` — boolean indicating whether any filter is active
- `getMatchingCount(topicId)` — returns matching count for a topic when filter is active

`CanvasToolbar` (relocated from bottom-right to top-right) includes:
- Search input (with clear button)
- Score filter dropdown (All scores, High >= 0.8, Low < 0.5, Unevaluated)
- Preview toggle (P0-6)
- Relayout button (existing)
- Active filter indicator with clear-all button

When filters are active, `CollapsedTopicNode` shows "X/Y matching" count and non-matching nodes are dimmed (opacity-50).

**Conversation Previews (P0-6)**

`CollapsedTopicNode` shows 1-2 truncated user message snippets when preview mode is on:
- Toggle via `showPreviews` / `togglePreviews` in `TopicCanvasContext`
- Uses `extractMessages` and `cleanText` from `ConversationThreadCell.utilities`
- Node width increases from `COLLAPSED_WIDTH` (300px) to `COLLAPSED_WIDTH_WITH_PREVIEW` (380px)

**Loading States (P0-15)**

`TopicHierarchyCanvas` shows an operation progress banner (top-left) during data generation/import/evaluation:
- `TopicCanvasContext` tracks `operationProgress` (`CanvasOperationProgress` type) and `generatingTopicName`
- Subscribes to `vllora_data_generation_progress` events via `emitter.on()`
- `CollapsedTopicNode` shows a pulsing border (`animate-pulse border-emerald-500/60`) when data is being generated for that specific topic

**Key Files:**
| File | Purpose |
|------|---------|
| `datasets/dataset-canvas/TopicCanvasContext.tsx` | Canvas state: search/filter, previews, operation progress |
| `datasets/dataset-canvas/CanvasToolbar.tsx` | Search input, score filter dropdown, preview toggle |
| `datasets/dataset-canvas/TopicHierarchyCanvas.tsx` | Operation progress banner |
| `datasets/dataset-canvas/topic-node/CollapsedTopicNode.tsx` | Matching count, previews, pulsing border |

### Record Filters & Role Types

`record-filters.ts` was enhanced with new filter types for evaluation/training clarity (P0-9) and clickable stat navigation (P0-19):

```typescript
/** Record role relative to evaluation/training pipeline (P0-9) */
export type RecordRole = "all" | "training" | "evaluated";

/** Stat filter type for clickable stats in RecordsSectionHeader (P0-19) */
export type StatFilter = "all" | "from_spans" | "labeled" | "evaluated";

export interface RecordFilterOptions {
  search?: string;
  topic?: string;
  generated?: "all" | "generated" | "not_generated";
  role?: RecordRole;        // P0-9: Filter by evaluation status
  statFilter?: StatFilter;  // P0-19: Filter by stat category
}
```

### Clickable Stats Navigation (P0-19)

`RecordsSectionHeader` stats are now clickable filter chips via the `StatChip` component:
- New props: `activeStatFilter` (`StatFilter`) and `onStatFilterChange` callback
- Clicking a stat toggles that filter; clicking the same stat again clears it
- Active filter shown with theme-colored highlight; "Clear" (X) button appears when filter is active
- Topics stat is non-clickable (it opens a dialog instead)

### Evaluation/Training Visual Distinction (P0-9)

`RecordRow` now shows a violet left border for evaluated records:
- `border-l-2 border-l-violet-500/60` applied when `record.evaluation?.score !== undefined`
- Hardcoded zinc colors replaced with semantic CSS variable classes (`bg-card/30`, `border-border`, `hover:bg-muted/50`)

### Canvas Records Dialog (P0-1)

`TopicRecordsDialog` now includes full record management capabilities:
- `selectable={true}` and `showHeader={true}` passed to `RecordsTable`
- Search bar with `filterRecords()` from `record-filters.ts`
- Bulk actions bar (delete selected) visible when records are selected
- Selection state and search query cleared on dialog close

### Semantic Theming

Hardcoded dark-theme colors were replaced with semantic CSS variable classes across Canvas components:
- `bg-[#111113]` → `bg-card`
- `border-emerald-500/40` → `border-border`
- `hover:border-emerald-500/50` → `hover:border-muted-foreground/50`
- `text-zinc-600` → `text-muted-foreground/60`
- `text-zinc-700` → `text-border`
- `bg-zinc-800/30` → `bg-card/30`
- Box shadow `rgba(16, 185, 129, ...)` → `rgba(var(--theme-500), ...)`

### Dataset State System

Datasets have a `state` field (`DatasetState = 'draft' | 'in_finetune' | 'completed'`) with shared display config:

```typescript
// In dataset-types.ts
export const DATASET_STATE_CONFIG: DatasetStateConfig[] = [
  { value: 'draft', label: 'Draft', className: 'bg-muted text-muted-foreground' },
  { value: 'in_finetune', label: 'Processing', className: 'bg-amber-500/15 text-amber-600 ...' },
  { value: 'completed', label: 'Completed', className: 'bg-emerald-500/15 text-emerald-600 ...' },
];
```

This config is consumed by `DatasetCard` (state badge), `DatasetsListHeader` (filter tabs), and `DatasetCard` (top accent bar color).

### CSS Theme Variables Note

Theme colors use CSS custom properties as space-separated RGB values (e.g., `--theme-500: 99 102 241`). The Tailwind opacity modifier `[rgb(var(--theme-500))]/50` does **not** work with these values. Use `rgba()` instead: `[rgba(var(--theme-500),0.5)]`.

---

## End-to-End Data Flow

### Port Map

| Service | Default Port | Env Override | Protocol |
|---------|-------------|--------------|----------|
| React UI (Vite) | 5173 | — | HTTP |
| vLLora Gateway | 9090 | `VITE_BACKEND_PORT` | HTTP REST + SSE |
| Distri Server | 8081 | `VITE_DISTRI_PORT` | HTTP + WebSocket |
| OTEL Collector | 4317 | `VITE_OTEL_PORT` | gRPC |
| LangDB Cloud | — | `LANGDB_API_URL` | HTTPS |

### Connection Types

1. **FE → Gateway (HTTP REST)**: All API calls via `src/services/finetune-api.ts`. Base URL from `VITE_BACKEND_PORT` (default 9090). `x-project-id` header for project scoping.
2. **FE → Distri (WebSocket/A2A)**: Lucy chat via vendored `@distri/react` and `@distri/core`. WebSocket to `localhost:8081/v1`.
3. **Gateway → Cloud API (HTTPS proxy)**: `LangdbCloudFinetuneClient` forwards `/finetune/*` requests to `https://api.langdb.cloud`. Auth via `LANGDB_API_KEY`.
4. **Gateway → Distri (managed process)**: Gateway downloads and manages the Distri binary (`~/.vllora/distri/`), auto-starts with health checks.

### Per-Step Data Flow

| Step | What happens | Cloud API? |
|------|-------------|-----------|
| **Topics Config** | LLM generates hierarchy via Distri → tool saves to IndexedDB | No |
| **Categorization** | Tool assigns topics to records in IndexedDB | No |
| **Coverage & Generation** | Tool calls Gateway `POST /v1/chat/completions` for LLM data gen → saves to IndexedDB | No (uses LLM inference, not finetune API) |
| **Grader Config** | Tool builds grader script locally; optional `test_grader_sample` uploads temp dataset | Only if auto_test |
| **Evaluation (Dry Run)** | `POST /finetune/datasets` + `POST /finetune/evaluations` → DryRunPollingManager polls every 6s → scores saved to IndexedDB | Yes |
| **Training** | `POST /finetune/reinforcement-jobs` → Gateway state tracker polls every 30s → SSE broadcast → FE updates | Yes |
| **Deployment** | `POST /finetune/deployments` → model registered | Yes |

### Finetune Endpoint Table

All endpoints used in the finetune flow. Gateway base: `localhost:9090/lucy/v1`.

| # | Method | Gateway Route | Pipeline Step | Purpose |
|---|--------|--------------|---------------|---------|
| 1 | POST | `/finetune/datasets` | Evaluation, Training | Upload JSONL dataset + grader (multipart) |
| 2 | GET | `/finetune/datasets/{id}/analytics` | Evaluation | Dataset quality metrics |
| 3 | POST | `/finetune/datasets/analytics/dry-run` | Evaluation | Preview analytics |
| 4 | PATCH | `/finetune/datasets/{id}/evaluator` | Grader | Update grader config (new version) |
| 5 | GET | `/finetune/datasets/{id}/evaluator/versions` | Grader | Evaluator version history |
| 6 | POST | `/finetune/evaluations` | Evaluation | Start evaluation (dry run) |
| 7 | GET | `/finetune/evaluations/{run_id}` | Evaluation (polling) | Poll eval status + per-row results |
| 8 | GET | `/finetune/datasets/{id}/finetune-evaluations` | Training (analysis) | Per-record per-epoch training scores |
| 9 | POST | `/finetune/reinforcement-jobs` | Training | Start RFT job |
| 10 | GET | `/finetune/reinforcement-jobs` | Training | List cached jobs (local SQLite) |
| 11 | GET | `/finetune/reinforcement-jobs/{id}/status` | Training (polling) | Job status (local first, cloud fallback) |
| 12 | GET | `/finetune/reinforcement-jobs/{id}/metrics` | Training (analysis) | GRPO/GSPO reinforcement metrics |
| 13 | POST | `/finetune/reinforcement-jobs/{id}/cancel` | Training | Cancel running job |
| 14 | POST | `/finetune/reinforcement-jobs/{id}/resume` | Training | Resume cancelled job |
| 15 | GET | `/finetune/reinforcement-jobs/{id}/weights/url` | Deployment | Signed URL for trained weights |
| 16 | POST | `/finetune/deployments` | Deployment | Deploy fine-tuned model |
| 17 | DELETE | `/finetune/deployments/{id}` | Deployment | Delete deployment |
| 18 | POST | `/v1/chat/completions` | Coverage & Generation | LLM inference for synthetic data |
| 19 | GET | `/events` | Training (polling) | Real-time job status via SSE |

### Data Residency

| Data | Where it lives | Persistence |
|------|---------------|-------------|
| Datasets (records, topics, metadata) | Browser IndexedDB | Permanent (local-first) |
| Workflow state (7-step progress) | Browser IndexedDB | Permanent |
| Evaluation jobs (status, results) | Browser IndexedDB + Cloud PostgreSQL | Both |
| Per-record scores | Browser IndexedDB (copied from cloud on completion) | Permanent locally |
| Training jobs | Cloud PostgreSQL + Gateway SQLite (cache) | Cloud is source of truth |
| Training metrics (GRPO/GSPO) | Cloud PostgreSQL | Cloud is source of truth |
| Iteration state (proposals, history) | Browser IndexedDB | Permanent |
| Chat messages | Not persisted (fresh thread per session) | Ephemeral |
| Trained model weights | Provider storage (Fireworks/OpenAI) | Provider-managed |

### Event & Polling Architecture

**Evaluation polling (FE-driven):**
- `DryRunPollingManager` (singleton) polls `GET /finetune/evaluations/{run_id}` every 6s
- Emits `vllora_dry_run_job_update` (progress) and `vllora_dry_run_job_completed` (done)
- On complete: LucySidebar auto-triggers Lucy analysis, scores persisted to IndexedDB

**Training polling (Gateway-driven + FE polling):**
- Gateway state tracker polls cloud every 30s → writes status + scores to SQLite
- FE polls BE `listFinetuneJobs` every 15s → detects status transitions
- On complete: emits `vllora_finetune_job_completed` → LucySidebar auto-triggers analysis

**Session resumption (catch-up):**
1. FE creates fresh thread (no message history)
2. `buildCatchUpContext()` reads unreviewed jobs, iteration state, workflow state from IndexedDB
3. Cross-references stale training status vs cloud API, fixes stale records
4. `LucyCatchUpCard` renders as landing view with completed steps, score matrix, per-topic breakdown, action buttons

---

## Related Documentation

- [State Machine](./state-machine.md) - Workflow state transitions
- [Guided Onboarding](./guided-onboarding.md) - Planning system and onboarding flow
- [Event Emitter Guide](./event-emitter-guide.md) - Event system reference
- [README](./README.md) - Overview and documentation index
