# E2E Test Framework

How we structure, execute, and track full Lucy chat E2E tests with mock finetune API.

---

## Why This Framework Exists

Lucy's finetune pipeline has complex state interactions across multiple layers:
- **IndexedDB** stores datasets, workflows, eval jobs, knowledge sources
- **UI components** render from context providers that read IndexedDB
- **Event emitters** trigger updates between components
- **Lucy's chat** drives tool execution which mutates all of the above

Bugs emerge at the seams: stale data after tool execution, duplicate renders from racing event listeners, IndexedDB updates that don't propagate to the UI, sidebar state that diverges from detail panel state.

This framework provides:
1. **Structured test cases** with clear pass/fail criteria
2. **Evidence collection** (screenshots, DOM snapshots) at every checkpoint
3. **UI consistency checks** targeting known failure modes
4. **Result tracking** so we know what works, what doesn't, and what to fix

---

## Test Infrastructure

### Setup (Proxy Mode)

```bash
# Terminal 1: Real backend (Distri at 8081 + vLLora gateway at 9090)
./scripts/restart-backend.sh

# Terminal 2: Mock server in proxy mode (instant finetune results)
pnpm mock-server:lucy

# Terminal 3: Frontend pointing to mock server
VITE_BACKEND_PORT=9091 pnpm dev
```

See [mock-test-architecture.md](./mock-test-architecture.md) for full architecture details.

### Scenario Control

Switch mock finetune scenarios at runtime:
```bash
# Healthy eval + improving training (default)
curl -X POST http://localhost:9091/mock/scenario \
  -d '{"evalScenario":"healthy","trainingScenario":"improving"}'

# Critical eval (binary scores, grader issues)
curl -X POST http://localhost:9091/mock/scenario \
  -d '{"evalScenario":"critical"}'

# Training overfitting
curl -X POST http://localhost:9091/mock/scenario \
  -d '{"trainingScenario":"overfitting"}'

# Reset everything
curl -X POST http://localhost:9091/mock/reset
```

Available scenarios: see [mock-test-architecture.md § Scenario Descriptions](./mock-test-architecture.md#scenario-descriptions).

---

## Test Case Structure

### Directory Layout

```
docs/enhance-lucy/
  e2e-test-framework.md     # This file — overview and conventions
  e2e-tests/                 # TEST SCENARIOS (immutable definitions)
    _registry.md             # Master list of all scenarios + execution priority
    01-topics/               # Pipeline step 1
    02-categorization/       # Pipeline step 2
    03-coverage-generation/  # Pipeline step 3
    04-grader/               # Pipeline step 4
    05-evaluation/           # Pipeline step 5 (4 scenarios)
    06-training/             # Pipeline step 6 (4 scenarios)
    07-deployment/           # Pipeline step 7
    08-knowledge-sources/    # Knowledge source upload + extraction
    09-records-management/   # Record CRUD, bulk ops, variants
    10-dataset-crud/         # Dataset create, rename, import, delete
    11-skill-package/        # Skill package generate + download
    lucy-behavior/           # Lucy agent behavior (13 tests: planning, decisions, state)
    dummy-user/              # Unexpected user behavior (5 tests: race conditions, bad input)
    ui-interactions/         # UI-specific interactions (3 tests: tabs, canvas, sidebar)
    cross-cutting/           # Tests spanning multiple areas (7 tests)
  e2e-runs/                  # TEST RESULTS (separate from scenarios)
    _run-index.md            # History of all runs
    {date}-run-{N}/          # One directory per test run
```

**58 test cases** across 16 areas. See [_registry.md](./e2e-tests/_registry.md) for full list and execution priority.

### Test Case ID Convention

```
TC-{AREA}-{NNN}

Areas:
  TOP   = Topics (Step 1)
  CAT   = Categorization (Step 2)
  COV   = Coverage & Generation (Step 3)
  GRD   = Grader Config (Step 4)
  EVAL  = Evaluation / Dry Run (Step 5)
  TRN   = Training (Step 6)
  DEP   = Deployment (Step 7)
  KS    = Knowledge Sources
  REC   = Records Management
  DS    = Dataset CRUD
  SKL   = Skill Package
  POLL  = Polling
  LUCY  = Lucy Agent Behavior (planning, decisions, state awareness)
  DU    = Dummy User (unexpected behavior)
  UI    = UI Interactions
  CC    = Cross-Cutting (spans multiple steps)
```

---

## Test Case File Format

Each `.md` file follows this template:

```markdown
---
id: TC-EVAL-001
title: "Evaluation - Happy Path: Run eval and view results"
area: evaluation
priority: P0
type: happy-path | edge-case | error-case | regression
mock-scenario: '{"evalScenario":"healthy","evalPollsBeforeComplete":1}'
preconditions:
  - Dataset exists with topics, categories, and generated records
  - Grader is configured
  - Workflow state is at "grader-complete" or later
---

# Note: No last-run/last-result here. Results are stored separately in e2e-runs/.

# TC-EVAL-001: Evaluation - Happy Path

## Preconditions

- Dataset with completed topics + categories + generated records + grader
- Mock scenario: `evalScenario: "healthy"`, `evalPollsBeforeComplete: 1`
- Lucy sidebar open, user on dataset detail page

## Steps

### Step 1: Request evaluation
- **Action**: Tell Lucy "Run an evaluation on this dataset"
- **Expected**: Lucy acknowledges and calls `run_evaluation` tool
- **Hard checks**:
  - [ ] Tool execution card appears in chat with "run_evaluation"
  - [ ] Progress indicator appears (polling state)
- **Soft checks**:
  - [ ] Lucy's message mentions running evaluation or dry run
- **Evidence**: screenshot of chat showing tool card

### Step 2: Evaluation completes
- **Action**: Wait for eval to complete (instant with mock)
- **Expected**: Results appear in UI
- **Hard checks**:
  - [ ] Evaluation results panel shows score summary
  - [ ] Per-topic scores are visible
  - [ ] Overall mean score matches expected (~0.65 for healthy)
  - [ ] Sidebar workflow indicator shows evaluation complete
  - [ ] No duplicate result entries
- **Evidence**: screenshot of eval results, DOM snapshot of results panel

### Step 3: Lucy analyzes results
- **Action**: Wait for Lucy to call `analyze_evaluation`
- **Expected**: Analysis checkpoint appears in chat
- **Hard checks**:
  - [ ] LucyAnalyzeEvalRenderer shows in chat
  - [ ] Analysis shows `next_action: "train"` (healthy scenario)
  - [ ] Score summary matches eval results
  - [ ] No stale data from previous evaluations
- **Evidence**: screenshot of analysis checkpoint

### Step 4: Verify persistence
- **Action**: Refresh the page
- **Hard checks**:
  - [ ] Evaluation results survive refresh
  - [ ] Analysis checkpoint still visible in chat history
  - [ ] Scores unchanged
  - [ ] No "flash of stale content" on reload
- **Evidence**: screenshot after refresh

## Pass Criteria

- ALL hard checks pass across all steps
- No console errors (`read_console_messages` shows no errors)
- No failed network requests for `/finetune/*` endpoints
- UI state matches IndexedDB state after each step

## Fail Criteria

- Any hard check fails
- Console shows unhandled rejection or IndexedDB error
- Data displayed in UI does not match mock API response
- Duplicate elements detected in DOM snapshot
```

---

## Two Types of Assertions

### Hard Assertions (Deterministic)

These have a binary pass/fail. The data is controlled by mock scenarios.

| Category | What to check | How to verify |
|----------|--------------|---------------|
| **Element presence** | Component renders in DOM | `find(query)` returns element |
| **Data accuracy** | Displayed values match mock response | `read_page(ref_id)` → compare text |
| **Count correctness** | N items shown = N items expected | `find` → count results |
| **State consistency** | Sidebar state matches detail panel | Compare both panels |
| **Persistence** | Data survives page refresh | Refresh → re-check |
| **No duplicates** | Each item appears exactly once | DOM snapshot → check unique IDs |

### Soft Assertions (Non-Deterministic)

Lucy's conversational responses vary. Use rubric-based evaluation.

| Category | What to check | Pass threshold |
|----------|--------------|---------------|
| **Relevance** | Lucy's response mentions the topic | Response contains relevant keywords |
| **Plan quality** | Plan covers expected workflow steps | Mentions at least 3/5 expected steps |
| **Error handling** | Lucy acknowledges and explains errors | Response addresses the error clearly |

---

## UI Consistency Checks (Known Failure Modes)

These checks target specific bugs that emerge from Lucy's architecture:

### 1. Stale Data

**What**: UI shows data from a previous evaluation/training run after a new one completes.

**How to detect**:
- Compare displayed eval run ID with the latest mock eval run ID
- Check timestamps — displayed results should be newer than previous run
- After scenario switch + new eval, old scores should not be visible

### 2. Duplicate Rendering

**What**: A component renders twice, showing the same data in two places.

**How to detect**:
- DOM snapshot of results panel → check for repeated elements with same content
- Count topic entries vs expected count
- Check that iteration checkpoints don't duplicate

### 3. IndexedDB ↔ UI Mismatch

**What**: IndexedDB has been updated (by a tool handler) but the UI hasn't re-rendered.

**How to detect**:
- After tool execution, read IndexedDB via `javascript_tool`:
  ```js
  // Check IndexedDB directly
  const db = await indexedDB.databases();
  ```
- Compare with what the UI displays
- Known trigger: event emitter listener not cleaned up → stale closure reads old state

### 4. Sidebar ↔ Detail Panel Divergence

**What**: Sidebar shows different state than the detail panel.

**How to detect**:
- Read sidebar workflow indicator status
- Read detail panel state
- They must agree on: current step, completion status, active job

### 5. Cross-Step Data Bleeding

**What**: Data from Step N appears in Step N+1's UI.

**How to detect**:
- After advancing workflow steps, check that the new step's panel shows only its own data
- Previous step's results should be in history, not in the active view

---

## Scenarios vs Results: Clear Separation

**Test scenarios** (test case definitions) and **test results** (execution outcomes) are stored separately so scenarios can be re-run any time without overwriting previous results.

### What goes WHERE

| Content | Location | Versioned in git? |
|---------|----------|-------------------|
| Test scenarios (steps, assertions, preconditions) | `e2e-tests/{area}/TC-*.md` | Yes |
| Test registry (master list of scenarios) | `e2e-tests/_registry.md` | Yes |
| Test results (pass/fail per step, evidence) | `e2e-runs/{run-id}/` | Only `result.md` |
| Run index (history of all runs) | `e2e-runs/_run-index.md` | Yes |
| Screenshots, GIFs, DOM snapshots | `e2e-runs/{run-id}/` | No (gitignored) |
| Issues found during testing | `docs/enhance-lucy/issue/` | Yes |

### Why separate?

- **Re-testing**: When a feature changes, re-run all scenarios — results go in a new `e2e-runs/{run-id}/` directory
- **History**: Each run is its own directory. You can compare runs across code changes.
- **Clean scenarios**: Test case files are NEVER modified during testing. They define WHAT to test, not WHEN it was tested.
- **Regression tracking**: Same scenario, multiple runs → easy to see if a fix actually fixed the issue.

---

## Evidence Collection

### What to Capture at Each Step

| Tool | What it captures | When to use |
|------|-----------------|-------------|
| `screenshot` | Visual state of the page | Every assertion point |
| `find(query)` | Specific element existence + ref | Checking element presence |
| `read_page(ref_id, depth:3)` | DOM subtree for comparison | Data accuracy checks |
| `read_console_messages(onlyErrors:true)` | Runtime errors | After each tool execution |
| `read_network_requests(urlPattern:"/finetune/")` | API call verification | After eval/training operations |
| `javascript_tool` | IndexedDB state | Data consistency checks |

---

## Test Results Storage

### Directory Structure

```
e2e-runs/
  _run-index.md              # History of all test runs (git-tracked)
  2026-03-10-run-01/          # One directory per test run
    meta.md                   # Run metadata (date, git commit, scenario, tester)
    TC-TOP-001.md             # Result for this scenario
    TC-EVAL-001.md            # Result for this scenario
    TC-EVAL-001-step2.png     # Screenshot evidence (gitignored)
    TC-EVAL-001-step3.png     # Screenshot evidence (gitignored)
    ...
  2026-03-12-run-02/          # Another run (after a fix)
    meta.md
    TC-EVAL-001.md            # Re-test of same scenario
    ...
```

### Run Metadata (`meta.md`)

```markdown
# Test Run: 2026-03-10-run-01

- **Date**: 2026-03-10
- **Git commit**: abc1234
- **Git branch**: feat/finetune-integration
- **Mock scenarios**: evalScenario=healthy, trainingScenario=improving
- **Tester**: Claude Code / manual
- **Trigger**: Initial full test pass / regression after PR #42 / feature X added

## Summary

| Result | Count |
|--------|-------|
| Pass | 12 |
| Fail | 3 |
| Not Run | 33 |
| Blocked | 0 |

## Failed Tests

| ID | Step | Issue |
|----|------|-------|
| TC-DU-001 | Step 2 | Records table shows stale count after deletion during generation |
| TC-CC-002 | Step 3 | Sidebar workflow indicator 1 step behind detail panel |
| TC-EVAL-002 | Step 3 | LucyAnalyzeEvalRenderer shows duplicate recommendation cards |
```

### Per-Scenario Result (`TC-EVAL-001.md`)

```markdown
# TC-EVAL-001 — Run 2026-03-10-run-01

**Result**: PASS | FAIL | BLOCKED
**Duration**: ~3 min

## Step Results

### Step 1: Request evaluation — PASS
- [x] Tool execution card appears
- [x] Progress indicator appears
- Evidence: TC-EVAL-001-step1.png

### Step 2: Evaluation completes — PASS
- [x] Results panel shows score summary
- [x] Per-topic scores visible
- [x] Overall mean ~0.65
- [x] Sidebar shows evaluation complete
- [x] No duplicate entries
- Evidence: TC-EVAL-001-step2.png

### Step 3: Lucy analyzes — FAIL
- [x] LucyAnalyzeEvalRenderer shows
- [ ] Analysis shows next_action: "train" — ACTUAL: shows "iterate"
- [x] Score summary matches
- [x] No stale data
- Evidence: TC-EVAL-001-step3.png
- **Issue**: ISSUE-017 — Wrong next_action for healthy scenario

### Step 4: Verify persistence — PASS
- [x] Results survive refresh
- [x] Analysis checkpoint visible
- [x] Scores unchanged
```

### Run Index (`_run-index.md`)

```markdown
# E2E Test Run History

| Run ID | Date | Commit | Tests Run | Pass | Fail | Trigger |
|--------|------|--------|-----------|------|------|---------|
| 2026-03-10-run-01 | 2026-03-10 | abc1234 | 15 | 12 | 3 | Initial test pass |
| 2026-03-12-run-02 | 2026-03-12 | def5678 | 3 | 3 | 0 | Re-test after ISSUE-017 fix |
```

> **Note**: `e2e-runs/` binary files (screenshots, GIFs) should be gitignored. Only `.md` files are tracked in git for history.

---

## Workflow: Running a Test

### 1. Set up environment
```bash
./scripts/restart-backend.sh       # Terminal 1
pnpm mock-server:lucy              # Terminal 2
VITE_BACKEND_PORT=9091 pnpm dev    # Terminal 3
```

### 2. Set mock scenario
```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"healthy","evalPollsBeforeComplete":1}'
```

### 3. Create a run directory
```bash
mkdir -p docs/enhance-lucy/e2e-runs/$(date +%Y-%m-%d)-run-01
```

### 4. Execute test steps

Open test scenario file (e.g., `e2e-tests/05-evaluation/TC-EVAL-001.md`) and follow each step:
- Perform the action
- Capture evidence (screenshot, DOM snapshot) → save to run directory
- Check all assertions
- Note pass/fail for each checkbox

### 5. Record result

Create `e2e-runs/{run-id}/TC-EVAL-001.md` with per-step pass/fail and evidence links.

**Important**: Do NOT modify the scenario file. Results are separate files.

### 6. Update run index

Add a row to `e2e-runs/_run-index.md` with the run summary.

### 7. Create issues for failures

For each failed test, create an issue in `docs/enhance-lucy/issue/` (see Issue Management below).

---

## Issue Management

When a test fails, create an issue in `docs/enhance-lucy/issue/`:

```markdown
# Issue: {brief description}

**Found in**: TC-EVAL-002 (Step 3)
**Severity**: High | Medium | Low
**Category**: stale-data | duplicate-render | data-mismatch | state-divergence | error-handling
**Status**: Open | In Progress | Fixed | Verified

## Problem

{What happened — describe the actual vs expected behavior}

## Evidence

- Screenshot: `e2e-runs/2026-03-09-TC-EVAL-002/step3-screenshot.png`
- DOM snapshot showing duplicate: `step3-dom.json`

## Root Cause

{Analysis of why — which layer (IndexedDB, context, event emitter, component)}

## Fix

{What was changed — files, approach}

## Verification

{How to verify the fix — re-run TC-EVAL-002, check specific assertions}
```

---

## Test Scenario Matrix

Maps mock scenarios to expected UI behavior:

| Mock Scenario | Eval Score | Lucy Analysis | Expected UI State | Key Checks |
|---------------|-----------|---------------|-------------------|------------|
| `evalScenario: "healthy"` | ~0.65 | `next_action: "train"` | Green indicators, "Ready to train" | Score display, action button |
| `evalScenario: "warning"` | ~0.42 | `next_action: "iterate"` | Yellow indicators, "Iterate recommended" | Warning badge, topic breakdown |
| `evalScenario: "critical"` | ~0.18 | `next_action: "escalate"` | Red indicators, stall warning | Stall count, escalation message |
| `evalScenario: "stalled"` | ~0.45 | `next_action: "escalate"` | Stall warning on PlanCard | Iteration history comparison |
| `evalScenario: "error"` | 0 | Error in tool result | Error state in UI | Error message, retry option |
| `trainingScenario: "improving"` | Scores ↑ | `next_action: "deploy_eval"` | Training complete, deploy option | Epoch scores, progress chart |
| `trainingScenario: "overfitting"` | Scores ↑↓ | `next_action: "investigate"` | Overfitting warning | Epoch score trend, warning |
| `trainingScenario: "noLearning"` | Flat | `next_action: "inner_loop"` | "No improvement" warning | Score comparison, iterate suggestion |
| `trainingScenario: "error"` | 0 | Error in tool result | Training failed state | Error message, retry option |

---

## Video Capture

For complex flows (full pipeline, multi-step interactions), video capture provides the best evidence of timing issues, flash-of-stale-content, and user experience quality.

### Using Chrome MCP GIF Recording

```
# Start recording before test begins
gif_creator(action: "start_recording", tabId: ...)

# ... execute test steps ...

# Stop and export
gif_creator(action: "stop_recording", tabId: ...)
gif_creator(action: "export", tabId: ..., download: true, filename: "TC-CC-001-full-pipeline.gif")
```

This captures click interactions, scrolls, and page transitions into an animated GIF — perfect for documenting the flow and identifying timing-related UI issues.
