# Distri Capabilities for Lucy Iteration Loop

What already exists in the distri stack that we can leverage — no need to build from scratch.

---

## 1. Replan Is Built-In (agent_loop.rs)

The Distri server already supports replanning:

```rust
// agent_loop.rs
pub async fn replan(&mut self) -> Result<()> {
    self.planner.replan(/* current plan as context */)
    // Emits PlanStarted { initial_plan: false } for replans
}
```

**What this means**: When Lucy needs to re-plan after an evaluation, we call the existing `replan()` method. The `PlanStartedEvent.initial_plan` field already distinguishes initial plans from replans — the UI can render them differently.

**UI leverage**: Show "Iteration 2 Plan" vs "Initial Plan" based on `initial_plan: false`.

---

## 2. InputRequired Task State (A2A Protocol)

The A2A protocol has a native `InputRequired` state:

```rust
pub enum TaskState {
    Submitted, Working, InputRequired,  // ← pauses and asks user
    Completed, Canceled, Failed, Rejected,
    AuthRequired, Unknown
}
```

**What this means**: When Lucy detects a stall or needs user approval between iterations, the agent can transition to `InputRequired`. The chat UI already handles this state — it pauses streaming and shows the agent is waiting for input.

**UI leverage**: Stall detection → agent sets `InputRequired` → sidebar shows "Awaiting Decision" badge → user responds in chat or clicks a button.

---

## 3. Artifacts with Append Mode (A2A Protocol)

Tasks can have artifacts that accumulate data:

```rust
pub struct Artifact {
    artifact_id: String,
    parts: Vec<Part>,
    name: Option<String>,
    description: Option<String>,
}

pub struct TaskArtifactUpdateEvent {
    task_id: String,
    artifact: Artifact,
    append: Option<bool>,  // ← CAN APPEND incrementally
}
```

**What this means**: Each iteration's analysis can be stored as an artifact on the task. Using `append: true`, we add iteration data incrementally without replacing previous data. The UI can read all artifact parts to show the full iteration history.

**UI leverage**:
- Artifact "iteration-1": `{ score: 0.45, topics: {...}, diagnosis: "..." }`
- Artifact "iteration-2" (appended): `{ score: 0.58, topics: {...}, changes: "..." }`
- Progress panel reads all artifacts to render the iteration log.

---

## 4. Parent/Child Task Hierarchy (Orchestrator)

The orchestrator supports nested tasks:

```rust
// orchestrator.rs
parent_task_id: Option<String>  // sub-tasks linked to parent
```

**What this means**: The overall finetune process can be a parent task, with each iteration as a child task. This gives structured tracking without flattening everything into one long task.

**UI leverage**: Parent task shows overall progress. Child tasks show per-iteration details. The existing step renderer can show child task status.

---

## 5. Max Iterations Control (agent_loop.rs)

Already configurable per agent:

```rust
// Read from agent definition
let max_iterations = agent_def.max_iterations.unwrap_or(MAX_ITERATIONS); // default 10

// Enforced in the execution loop
if step_index >= max_iterations {
    return Err("Max iterations reached");
}

// Exposed to agent context
fn get_iteration_info(max_iterations) -> String {
    format!("{current}/{max}")
}
```

**What this means**: We can set the max iteration count from the client when starting the finetune process. The agent loop enforces the limit automatically.

**UI leverage**: "3 of 5 max iterations used" — read directly from agent context.

---

## 6. Todos/Sub-Tasks (@distri/core)

Full TodoItem lifecycle is production-ready:

```typescript
interface TodoItem {
    id: string
    title: string
    notes?: string
    status: 'Open' | 'InProgress' | 'Done'
    createdAt: string
    updatedAt: string
}

// Events
'todos_updated': TodoItem[]  // streamed from server
```

**What this means**: The iteration steps within each run (generate → upload → evaluate → analyze) can be tracked as TodoItems. The server already emits `todos_updated` events that the UI processes.

**UI leverage**: The progress panel's "Evaluating improved endgame prompts..." status line can come from the current TodoItem status.

---

## 7. ChatStateStore — Task/Plan/Step Tracking (@distri/react)

Already tracks full state:

```typescript
// States already managed:
TaskState:  { id, runId, planId, title, status, timestamps, metadata }
PlanState:  { id, steps, status, startTime, endTime, reasoning }
StepState:  { id, title, index, status, timestamps }

// Status lifecycle:
'pending' | 'running' | 'completed' | 'failed'

// Events already processed:
'run_started', 'run_finished', 'run_error'
'plan_started', 'plan_finished', 'plan_pruned'
'step_started', 'step_completed'
'tool_execution_start', 'tool_execution_end'
```

**What this means**: All the plumbing for tracking iteration progress from server to UI already exists. We extend metadata fields — not create new tracking systems.

**UI leverage**: Extend `TaskState.metadata` with `{ iteration: 3, target_score: 0.70, current_score: 0.65 }`. The progress panel reads this directly.

---

## 8. Event Emitter Pattern (vLLora)

Already battle-tested for progress tracking:

```typescript
// Existing progress events:
'vllora_plan_progress':              ExecutionProgress
'vllora_plan_proposed':              { plan, diff? }
'vllora_data_generation_progress':   { status, total, completed, currentTopic, ... }
'vllora_knowledge_source_updated':   { progress: { step, current, total, percent } }
```

**What this means**: We follow the same pattern for iteration events:

```typescript
// NEW events to add:
'vllora_iteration_started':    { iteration: number, dataset_id: string }
'vllora_iteration_completed':  { iteration: number, score: number, per_topic: {...} }
'vllora_iteration_stall':      { pattern: string, suggestion: string }
'vllora_iteration_target_hit': { iteration: number, final_score: number }
```

---

## 9. StepBasedRenderer (@distri/react)

Already renders steps with status indicators:

- Running → spinner
- Completed → checkmark
- Failed → error icon
- Duration tracking (endTime - startTime)

**UI leverage**: The iteration log entries in the progress panel can reuse this renderer pattern.

---

## Summary: Build vs Reuse

| Component | Build? | Reuse From |
|-----------|--------|------------|
| Iteration loop (server) | Reuse | `replan()` in agent_loop.rs |
| Pause/resume between iterations | Reuse | `InputRequired` A2A state |
| Iteration data storage | Reuse | A2A artifacts (append mode) |
| Max iterations enforcement | Reuse | `max_iterations` in agent_loop.rs |
| Iteration step tracking | Reuse | TodoItem lifecycle |
| Progress state management | Extend | ChatStateStore metadata |
| Progress events | Extend | Event emitter pattern |
| Step status rendering | Reuse | StepBasedRenderer |
| **Iteration progress panel UI** | **Build** | New component |
| **Score ring visualization** | **Build** | New component (small) |
| **Stall detection logic** | **Build** | New (in analyze tool) |
| **`get_evaluation_details` tool** | **Build** | New tool handler |
| **`log_iteration` / `get_iteration_history` tools** | **Build** | New tool handlers |
| **Agent instructions for iteration** | **Build** | Agent md updates |

**Bottom line**: ~70% reuse from existing distri infrastructure. The main new work is:
1. Two UI components (progress panel + score ring)
2. Three new tools (eval details, log iteration, get history)
3. Stall detection logic
4. Agent instruction updates
