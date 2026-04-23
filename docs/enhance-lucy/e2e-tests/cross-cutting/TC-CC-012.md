---
id: TC-CC-012
title: "Background Transition Reminder During Long Evaluation"
area: cross-cutting
priority: P3
type: happy-path
mock-scenario: '{"evalScenario":"healthy","evalPollsBeforeComplete":15}'
preconditions:
  - Dataset with records, grader configured
  - Eval job will take >60s (mock set to 15 polls at ~6s each = ~90s)
---

# TC-CC-012: Background Transition Reminder

## Purpose

Verify that during long-running eval jobs, Lucy proactively suggests the user work on other datasets after 60 seconds. Also verify the live eval progress card shows real-time progress.

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"healthy","evalPollsBeforeComplete":15}'
```

## Steps

### 1. Start evaluation and observe progress card

1. Start an evaluation on the dataset
2. **Hard checks:**
   - [ ] `LucyEvalProgressCard` appears in the chat area
   - [ ] Shows "Evaluating" with "In Progress" pulsing badge
   - [ ] Record count updates as polling progresses (e.g., "12 / 132 records")
   - [ ] Progress bar fills progressively
   - [ ] Elapsed time counter increments every second
   - [ ] "Continue in background" button is visible

### 2. Verify partial results display

After a few polling cycles:
- [ ] Mean score appears when `summary.average_score` becomes available
- [ ] Progress percentage updates correctly

### 3. Wait for 60-second reminder

1. Stay on the dataset page for 60+ seconds while eval runs
2. **Hard checks:**
   - [ ] After ~60 seconds, Lucy auto-sends a message: "This evaluation is taking a while — feel free to work on other datasets while you wait. I'll notify you when results are ready."
   - [ ] The reminder only fires ONCE per eval job (not repeatedly)

### 4. Verify progress card disappears on completion

1. Wait for eval to complete
2. **Hard checks:**
   - [ ] `LucyEvalProgressCard` disappears (returns null when `isComplete`)
   - [ ] Eval analysis card appears (auto-triggered by completion event)

### 5. Test "Continue in background" button

1. Start a new evaluation
2. Click "Continue in background" on the progress card
3. **Hard checks:**
   - [ ] `vllora_switch_tab` event fires with `tab: 'overview'`
   - [ ] User navigates away but eval continues polling

## Evidence

- Screenshot of eval progress card with partial results
- Screenshot of background reminder message in chat
- Screenshot showing progress card gone after completion

## Notes

- Progress card component: `LucyEvalProgressCard.tsx`
- Background timer: `LucySidebar.tsx` useEffect with `activeEvalJobId`
- Timer uses `bgReminderSentRef` to prevent duplicate reminders
- Progress card self-hides on completion (listens to `vllora_dry_run_job_update` for status change)
- 15 polls at ~6s each = ~90s total, comfortably over the 60s threshold
