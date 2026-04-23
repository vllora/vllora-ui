---
id: TC-CC-011
title: "Auto-Continue Countdown After Healthy Evaluation"
area: cross-cutting
priority: P2
type: happy-path
mock-scenario: '{"evalScenario":"healthy","evalPollsBeforeComplete":1}'
preconditions:
  - Dataset with records, grader configured
  - Eval job completes with healthy verdict
---

# TC-CC-011: Auto-Continue Countdown

## Purpose

Verify that when evaluation scores are healthy and `next_action === 'train'`, Lucy shows an auto-continue countdown card instead of standard action buttons. The countdown should auto-proceed to training after 8 seconds unless the user cancels.

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"healthy","evalPollsBeforeComplete":1}'
```

## Steps

### 1. Run evaluation and wait for completion

1. Start an evaluation on the dataset
2. Wait for eval to complete (mock completes after 1 poll)
3. Lucy auto-analyzes results (auto-trigger from `vllora_dry_run_job_completed`)

### 2. Verify auto-countdown card appears

**Hard checks:**
- [ ] Eval Analysis card renders with health badge "Healthy"
- [ ] Next action badge shows "Ready to Train"
- [ ] Auto-countdown card appears (NOT standard "Proceed to Training" / "Iterate More" buttons)
- [ ] Countdown shows "Auto-continue" pulsing badge
- [ ] Countdown shows "Scores healthy — auto-continuing in Xs" text
- [ ] Progress bar animates from 0% to 100%
- [ ] Two buttons visible: "Wait, I want to review" and "Start Now"

### 3. Test cancel behavior

1. Click "Wait, I want to review" before countdown completes
2. **Hard checks:**
   - [ ] Countdown stops
   - [ ] "Auto-continue paused" message appears
   - [ ] Standard action buttons appear: "Proceed to Training" and "Iterate More"

### 4. Test auto-proceed (fresh eval)

1. Run a new evaluation (or refresh)
2. Wait for countdown to complete (8 seconds)
3. **Hard checks:**
   - [ ] After 8s, "Proceeding to training" message appears
   - [ ] `vllora_lucy_prompt` event fires with training prompt
   - [ ] Lucy begins training flow

### 5. Test "Start Now" shortcut

1. Run a new evaluation
2. Click "Start Now" before countdown completes
3. **Hard checks:**
   - [ ] Immediately shows "Proceeding to training"
   - [ ] Training prompt sent without waiting

## Evidence

- Screenshot of countdown card with progress bar
- Screenshot of cancelled state with manual buttons
- Screenshot of auto-proceed state

## Notes

- Auto-countdown only appears when `health.overall === 'healthy'` AND `next_action === 'train'`
- Warning/critical health evaluations show standard buttons (no countdown)
- Component: `LucyAutoCountdownCard.tsx`
- Integration point: `LucyAnalyzeEvalRenderer.tsx` `EvalCheckpointCard`
