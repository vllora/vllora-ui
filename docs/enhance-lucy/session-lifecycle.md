# Session Lifecycle: How Lucy Handles Async Jobs & Resumption

The finetune pipeline has two long-running processes: **Evaluation (Dry Run)** and **Training (Finetune)**. Both are async backend jobs that can take minutes to hours. This doc defines how Lucy and the UI behave across the full lifecycle — from job start to user coming back days later.

---

## Current State (What Already Works)

| Mechanism | How It Works | Persisted Where |
|-----------|-------------|-----------------|
| **Dry run polling** | Singleton `DryRunPollingManager` polls every 6s, auto-recovers on page refresh | IndexedDB (`dryRunJobs` store) |
| **Finetune SSE + polling** | SSE for real-time status, evaluation polling every 20s, falls back to API | Backend (jobs live server-side) |
| **Thread persistence** | Thread ID stored as `lucy_thread_{datasetId}` in localStorage | localStorage |
| **Chat messages** | Reloaded from Distri server via threadId on reopen | Distri server |
| **Workflow state** | Step progress, metadata, dry run verdict | IndexedDB (`workflows` store) |
| **Per-record scores** | Dry run & finetune scores persisted to dataset records on job completion | IndexedDB (dataset records) |

**What's lost on navigation/refresh:** Streaming state, tool call execution, error toasts, todos (refetched from server).

---

## Implementation Status (2026-03-09)

**Fully implemented:**
- Reactive catch-up instructions in agent markdown (`vllora-finetune-agent.md`, `finetune-workflow-agent.md`)
- `reviewedByAgent` + `reviewedByAgentAt` fields on `DryRunJob` type (`src/types/dry-run-job.ts`)
- `mark_job_reviewed` tool (`src/lib/distri-finetune-tools/steps/mark-job-reviewed.ts`)
- `buildCatchUpContext()` in `src/hooks/useFineTuneAgentChat.ts` — checks for unreviewed completed/failed jobs and pending iteration proposals on dataset open
- Iteration state/history store (`src/services/finetune-iteration-db.ts`, IndexedDB v7 `iterationState` store)
- `log_iteration` + `get_iteration_history` tools (`src/lib/distri-finetune-tools/steps/iteration-history.ts`)
- Pending proposal persistence via `IterationState.phase === 'awaiting_user'` + `innerLoop.proposedChanges`
- Auto-trigger events: `vllora_dry_run_job_completed` (from `DryRunPollingManager`) and `vllora_finetune_job_completed` (from `FinetuneJobsContext`) → LucySidebar auto-sends Lucy a message when jobs complete in background

**NOT yet implemented:**
- Frontend notification badge in LucySidebar for unreviewed results (visual indicator only — all backend wiring is done)

---

## The Problem

Lucy currently has no awareness of where she was in the iteration loop. When a user reopens a dataset:

1. Lucy loads the thread (previous messages visible)
2. Lucy loads workflow state (which step we're on)
3. But Lucy **doesn't know**:
   - Was she in the middle of analyzing eval results?
   - Did she propose changes that haven't been applied yet?
   - Was a training job running? Did it complete while the user was away?
   - What iteration number are we on? What was the last decision?
   - Is there a completed job the user hasn't seen results for yet?

The user sees old chat messages but Lucy has **no context** to pick up where she left off.

---

## Design Principles

1. **Jobs are durable entities, not chat turns.** A job exists independently of the conversation. It has a stable ID, its own state, and survives any number of page refreshes.

2. **Poll for truth, listen for speed.** SSE/events make the UI feel fast, but the backend API is the source of truth on reconnect. Always reconcile.

3. **Stage labels, not spinners.** Show "Evaluating... 45/132 records scored" not a generic spinner.

4. **Progressive background transition.** Don't force users to choose upfront. Offer background mode after ~30s of active waiting.

5. **Lucy catches up, not starts over.** On reopen, Lucy reads the current state and presents a summary of what happened, not a blank slate.

---

## 5 Scenarios

### Scenario 1: User is Actively Watching

User starts an eval or training job and stays on the page.

```
User: "Run evaluation on the dataset"
Lucy: "Starting evaluation with Notation Grader on gpt-4o-mini..."
       [Progress: Evaluating... 12/132 records]
       [Progress: Evaluating... 67/132 records]
       [Progress: Evaluating... 132/132 records]
Lucy: "Evaluation complete. Here's what I found:
       Overall dry run score: 0.45 (below healthy range 0.25-0.65 ✓ but room to improve)

       Weak topics:
       - Pins: 0.22 (10 records) — grader says responses confuse pins with forks
       - Combinations: 0.31 (8 records) — responses are too generic

       Strong topics:
       - Forks: 0.68 (11 records) ✓

       I recommend adjusting the pin prompts to be more specific
       and adding 15 more combination records grounded in the PDF.

       [Accept & Apply Changes] [Modify Suggestion] [Skip to Training]"
```

**UX:** Inline progress in chat. Lucy narrates each phase. Results appear as a structured message with action buttons.

### Scenario 2: User Navigates Away During a Job

User starts an eval, then switches to a different dataset or leaves the page.

**While user is away:**
- Polling continues via `DryRunPollingManager` (survives navigation within the app)
- Job completes → results saved to IndexedDB → event emitted
- If user is on a different dataset, the event is queued

**When user returns to this dataset:**
```
Lucy: "Welcome back! While you were away:

       ✅ Evaluation completed (3 min ago)
       Dry run score: 0.45 → Details below

       [Full analysis card with per-topic breakdown]

       Based on these results, I recommend:
       1. Fix pin prompts (too vague)
       2. Add 15 combination records

       [Accept & Apply] [Show Full Results] [Dismiss]"
```

**Implementation:**
1. On dataset reopen, Lucy reads `DryRunJobsContext` for completed-but-unreviewed jobs
2. A new field `reviewedByAgent: boolean` on the job record tracks whether Lucy has presented results
3. If `reviewedByAgent === false` and job is `completed`, Lucy auto-generates a catch-up message

### Scenario 3: User Closes Browser Entirely

User starts a training job, closes the browser, comes back hours later.

**While browser is closed:**
- Backend continues the training job
- No polling happening (browser is closed)
- State in IndexedDB is stale (shows `running`)

**When user reopens the app:**
1. `DryRunPollingManager.initialize()` queries IndexedDB for running jobs, resumes polling
2. `FinetuneJobsContext` fetches fresh job list from backend via `listReinforcementJobs()`
3. Reconciliation happens: backend says `completed`, IndexedDB says `running` → update IndexedDB

```
Lucy: "Welcome back! I see you have a completed training job.

       Training completed 2 hours ago:
       - Model: ft:gpt-4o-mini-2024-07-18:org::abc123
       - 2 epochs, 132 records

       Epoch results:
       | Topic | Epoch 1 | Epoch 2 | Delta |
       |-------|---------|---------|-------|
       | Pins  | 0.35    | 0.52    | +0.17 |
       | Forks | 0.70    | 0.73    | +0.03 |

       Training scores are improving. I recommend running a dry run eval
       on the fine-tuned model to compare against the base model.

       [Run Post-Training Eval] [Deploy Model] [View Full Results]"
```

**Implementation:**
1. New field on workflow: `pendingJobResults: { type: 'dryrun' | 'finetune', jobId: string, completedAt: string }[]`
2. On dataset reopen, check for completed jobs that haven't been reviewed
3. Lucy reads job results and generates a catch-up analysis message
4. Mark as reviewed once Lucy presents it

### Scenario 4: Job Fails While User is Away

User starts eval, navigates away, eval fails.

**When user returns:**
```
Lucy: "⚠ Evaluation failed while you were away.

       Error: Grader function threw an error on record pins-003:
       'TypeError: Cannot read property 'notation' of undefined'

       This looks like a bug in the grader function. The 'notation'
       field is missing from some records in the Pins topic.

       I recommend:
       1. Fix the grader to handle missing 'notation' field
       2. Or regenerate pin records with the correct schema

       [Fix Grader] [Regenerate Pin Records] [View Error Details]"
```

**Implementation:** Same as Scenario 3 — reconcile state, present failure with diagnosis and actions.

### Scenario 5: Mid-Iteration Resumption

Lucy was in the middle of an iteration analysis (had proposed changes, user hadn't responded yet), then user navigated away and came back.

**What needs to persist across sessions:**
- Current iteration number
- Last evaluation results (already in IndexedDB)
- Lucy's proposed changes (need to be stored)
- Whether user accepted/rejected the proposal

```
Lucy: "Welcome back! We were in the middle of Iteration 2.

       Last time, I analyzed the evaluation results and proposed:
       - Fix 10 pin prompts (make more specific)
       - Add 15 combination records from Chapter 5
       - Loosen grader on notation format

       You hadn't responded yet. Would you like to:

       [Accept These Changes] [Review Analysis Again] [Start Fresh]"
```

**Implementation:**
1. Store iteration state in IndexedDB:
   ```typescript
   interface IterationState {
     datasetId: string
     iterationNumber: number
     phase: 'evaluating' | 'analyzing' | 'awaiting_user' | 'applying_changes' | 'training'
     lastEvalId?: string
     proposedChanges?: string  // JSON of what Lucy suggested
     userDecision?: 'accepted' | 'rejected' | 'modified'
   }
   ```
2. On reopen, Lucy reads iteration state and presents context-appropriate catch-up message
3. The chat thread already has the history, but iteration state gives Lucy the structured context to reason about what to do next

---

## Lucy's Catch-Up Protocol (On Reopen)

When a user opens a dataset, Lucy runs this logic before sending any message:

```
1. Load workflow state from IndexedDB
2. Load thread messages from Distri server (via threadId)
3. Check for pending job results:
   a. Query DryRunJobsContext for completed-but-unreviewed eval jobs
   b. Query FinetuneJobsContext for completed/failed training jobs
   c. Reconcile with backend (poll for truth)
4. Check iteration state:
   a. Load IterationState from IndexedDB
   b. Was Lucy mid-analysis? Mid-proposal? Waiting for user?
5. Determine catch-up action:
   ┌─────────────────────────────────────┐
   │ Has unreviewed completed job?       │
   │  → Present results + analysis       │
   ├─────────────────────────────────────┤
   │ Has unreviewed failed job?          │
   │  → Present error + suggestions      │
   ├─────────────────────────────────────┤
   │ Has pending iteration proposal?     │
   │  → Re-present proposal              │
   ├─────────────────────────────────────┤
   │ Has running job?                    │
   │  → Show live progress               │
   ├─────────────────────────────────────┤
   │ Nothing pending?                    │
   │  → Show DatasetStatusSummary        │
   └─────────────────────────────────────┘
```

---

## Progressive Background Transition

For jobs that take longer than expected:

```
0-15s:   Lucy narrates inline ("Evaluating record 12 of 132...")
15-30s:  Continue narrating, no change
30-60s:  Lucy adds: "This is taking a bit. You can keep watching or
         work on something else — I'll message you when it's done."
60s+:    Lucy adds: "Still running. Feel free to navigate away.
         I'll have results ready when you come back."
         [Continue Watching] [Work on Other Datasets]
```

**The key:** Lucy never forces the user to choose. She simply narrates and offers options as time passes.

---

## Notification Strategy

| Event | User is on dataset page | User is elsewhere in app | User closed browser |
|-------|------------------------|-------------------------|-------------------|
| Job started | Inline chat message | Toast notification | N/A |
| Job progress | Inline progress updates | Badge on sidebar | N/A |
| Job completed | Inline results + analysis | Toast + badge + catch-up on return | Catch-up on next visit |
| Job failed | Inline error + suggestions | Toast + badge + catch-up on return | Catch-up on next visit |
| Stall detected | Inline warning + escalation | Toast + catch-up on return | Catch-up on next visit |

**Badge:** The Lucy sidebar icon shows a notification dot when there are unreviewed job results.

**Future (not MVP):** Browser push notifications for jobs >5 min, email for jobs >1 hour.

---

## State Persistence Summary

| State | Where | Survives Refresh | Survives Browser Close |
|-------|-------|-----------------|----------------------|
| Job records (dry run) | IndexedDB | Yes | Yes |
| Job records (finetune) | Backend API | Yes (re-fetched) | Yes |
| Per-record scores | IndexedDB (dataset records) | Yes | Yes |
| Workflow step progress | IndexedDB | Yes | Yes |
| Iteration state (NEW) | IndexedDB | Yes | Yes |
| Thread ID | localStorage | Yes | Yes |
| Chat messages | Distri server | Yes (re-fetched) | Yes |
| Proposed changes (NEW) | IndexedDB (iteration state) | Yes | Yes |
| Reviewed-by-agent flag (NEW) | IndexedDB (job record) | Yes | Yes |
| Streaming/loading indicators | React state | No | No |
| Polling intervals | Singleton manager | Restarted on init | Restarted on init |

---

## New Data Structures Needed

### 1. IterationState (IndexedDB)

```typescript
interface IterationState {
  id: string                    // datasetId (one per dataset)
  iterationNumber: number
  phase: 'idle' | 'evaluating' | 'analyzing' | 'awaiting_user' | 'applying_changes' | 'training' | 'post_training'
  innerLoop: {                  // Dataset iteration (dry run eval)
    lastEvalId?: string
    lastEvalScore?: number
    proposedChanges?: ProposedChange[]
    userDecision?: 'accepted' | 'rejected' | 'modified'
  }
  outerLoop: {                  // Training iteration (finetune)
    lastTrainingJobId?: string
    lastEpochScores?: Record<string, number[]>  // topic → [epoch1, epoch2, ...]
    postTrainingEvalId?: string
  }
  history: IterationHistoryEntry[]
}

interface IterationHistoryEntry {
  iteration: number
  timestamp: string
  evalId: string
  dryRunScores: { mean: number, perTopic: Record<string, number> }
  changesMade: string
  decision: 'iterate' | 'train' | 'escalate'
}

interface ProposedChange {
  lever: 'grader' | 'records' | 'distribution' | 'training_config' | 'topics'
  description: string
  targetTopics?: string[]
  applied: boolean
}
```

### 2. Job Review Tracking

```typescript
// Add to existing DryRunJob record:
interface DryRunJob {
  // ... existing fields
  reviewedByAgent: boolean      // NEW: has Lucy presented results to user?
  reviewedAt?: string           // NEW: when Lucy presented results
}

// Add to FinetuneJob tracking:
interface FinetuneJobReview {
  jobId: string
  datasetId: string
  reviewedByAgent: boolean
  reviewedAt?: string
}
```

---

## Implementation Priority

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| `reviewedByAgent` flag on jobs | Low | High — enables catch-up messages | P0 |
| Lucy catch-up protocol (on reopen) | Medium | High — core UX improvement | P0 |
| IterationState in IndexedDB | Medium | High — enables mid-iteration resume | P0 |
| Progressive background transition | Low | Medium — nice UX touch | P1 |
| Sidebar notification badge | Low | Medium — visibility when away | P1 |
| Toast notifications for away-user | Low | Medium — awareness | P1 |
| Browser push notifications | Medium | Low (nice to have) | P3 |
