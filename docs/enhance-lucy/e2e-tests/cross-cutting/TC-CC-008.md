---
id: TC-CC-008
title: "Auto-Trigger Analysis on Job Completion"
area: cross-cutting
priority: P1
type: edge-case
mock-scenario: '{"evalScenario":"healthy","evalPollsBeforeComplete":2}'
preconditions:
  - Dataset at eval-ready state (topics + records + grader configured)
  - Mock scenario set to healthy with 2 polls before complete
---

# TC-CC-008: Auto-Trigger Analysis on Job Completion

## Purpose

Verify that when an evaluation job completes, the `vllora_dry_run_job_completed` event fires and Lucy automatically sends an analysis message WITHOUT the user needing to ask. This tests the auto-trigger mechanism that connects polling completion to Lucy's reactive analysis.

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"healthy","evalPollsBeforeComplete":2}'
```

## Preconditions

- Dataset with grader configured
- Mock scenario set to healthy, 2 polls before complete (gives time to observe)

## Steps

### Step 1: Ask Lucy to run evaluation

- **Action**: Tell Lucy to run evaluation
- **Hard checks**:
  - [ ] `run_evaluation` tool called
  - [ ] Eval job starts polling

### Step 2: Wait for eval completion — do NOT ask for analysis

- **Action**: Wait for eval to complete. **Do NOT type anything else.**
- **Hard checks**:
  - [ ] Eval completes after 2 poll cycles
  - [ ] `vllora_dry_run_job_completed` event fires
  - [ ] Lucy auto-sends analysis message (no user prompt needed)

### Step 3: Verify auto-triggered analysis

- **Action**: Observe Lucy's automatic response
- **Hard checks**:
  - [ ] LucyAnalyzeEvalRenderer appears in chat
  - [ ] User never typed "analyze" or "results" — Lucy auto-triggered
  - [ ] Health badge shows "Healthy"
  - [ ] Analysis includes per-topic breakdown
- **Evidence**: screenshot showing analysis appeared without user prompt

### Step 4: Verify job marked as reviewed

- **Action**: Check job review state
- **Hard checks**:
  - [ ] `mark_job_reviewed` was called
  - [ ] Job has `reviewedByAgent: true`
  - [ ] Notification badge (if visible) cleared after analysis
- **Evidence**: IndexedDB job state check

## Pass Criteria

- Lucy auto-triggers analysis on eval completion without user asking
- `vllora_dry_run_job_completed` event correctly triggers the auto-analysis flow
- Job marked as reviewed after Lucy presents results

## Fail Criteria

- User has to manually ask Lucy to analyze (auto-trigger failed)
- No analysis card appears after eval completes
- Job remains unreviewed after analysis is presented
