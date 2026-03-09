# E2E Test Registry

Master list of all test cases (scenarios). Test results are stored separately in `e2e-runs/`.

## Status Legend

| Status | Meaning |
|--------|---------|
| not-run | Test defined but never executed |
| pass | All hard assertions passed on last run |
| fail | One or more hard assertions failed |
| blocked | Cannot run due to dependency or environment issue |

---

## Test Cases

### Pipeline Step Tests

| ID | Title | Area | Priority | Type | Mock Scenario |
|----|-------|------|----------|------|---------------|
| TC-TOP-001 | Topics - Happy Path | topics | P0 | happy-path | - |
| TC-TOP-002 | Topics - Empty/Duplicate handling | topics | P1 | edge-case | - |
| TC-CAT-001 | Categorization - Happy Path | categorization | P0 | happy-path | - |
| TC-COV-001 | Coverage & Generation - Happy Path | coverage | P0 | happy-path | - |
| TC-GRD-001 | Grader Config - Happy Path | grader | P0 | happy-path | - |
| TC-GRD-002 | Grader - Test sample, viability, manual editing | grader | P1 | edge-case | - |
| TC-EVAL-001 | Evaluation - Healthy scenario | evaluation | P0 | happy-path | evalScenario=healthy |
| TC-EVAL-002 | Evaluation - Warning scenario | evaluation | P0 | edge-case | evalScenario=warning |
| TC-EVAL-003 | Evaluation - Critical + stall detection | evaluation | P0 | edge-case | evalScenario=critical |
| TC-EVAL-004 | Evaluation - Error handling | evaluation | P1 | error-case | evalScenario=error |
| TC-TRN-001 | Training - Improving (happy path) | training | P0 | happy-path | trainingScenario=improving |
| TC-TRN-002 | Training - Overfitting detection | training | P0 | edge-case | trainingScenario=overfitting |
| TC-TRN-003 | Training - No Learning → inner loop | training | P0 | edge-case | trainingScenario=noLearning |
| TC-TRN-004 | Training - Error handling | training | P1 | error-case | trainingScenario=error |
| TC-DEP-001 | Deployment - Happy Path | deployment | P0 | happy-path | trainingScenario=improving |

### Knowledge Source Tests

| ID | Title | Area | Priority | Type |
|----|-------|------|----------|------|
| TC-KS-001 | Upload and extraction happy path | knowledge-sources | P0 | happy-path |
| TC-KS-002 | Processing wait behavior and plan blocking | knowledge-sources | P0 | edge-case |

### Records & Data Management Tests

| ID | Title | Area | Priority | Type |
|----|-------|------|----------|------|
| TC-REC-001 | Records - Edit, bulk ops, and variants | records-management | P0 | happy-path |
| TC-SKL-001 | Skill Package - Generate, preview, download | skill-package | P1 | happy-path |

### Dataset CRUD Tests

| ID | Title | Area | Priority | Type |
|----|-------|------|----------|------|
| TC-DS-001 | Dataset - Create, rename, import, delete | dataset-crud | P0 | happy-path |

### Lucy Behavior Tests

| ID | Title | Area | Priority | Type |
|----|-------|------|----------|------|
| TC-LUCY-001 | Plan generation quality and structure | lucy-behavior | P0 | happy-path |
| TC-LUCY-002 | Dynamic replanning after user feedback | lucy-behavior | P0 | happy-path |
| TC-LUCY-004 | Mid-execution user intervention and course correction | lucy-behavior | P0 | edge-case |
| TC-LUCY-006 | Dataset state awareness and context-appropriate actions | lucy-behavior | P0 | happy-path |
| TC-LUCY-007 | Plan rejection: user says no and Lucy adapts | lucy-behavior | P0 | edge-case |
| TC-LUCY-009 | Replanning after iteration feedback (eval says iterate) | lucy-behavior | P0 | edge-case |
| TC-LUCY-010 | Out-of-scope requests and irrelevant messages | lucy-behavior | P1 | edge-case |
| TC-LUCY-011 | New conversation reset and context cleanup | lucy-behavior | P1 | regression |
| TC-LUCY-012 | Plan cancellation mid-execution | lucy-behavior | P0 | edge-case |
| TC-LUCY-013 | Impossible requests and missing prerequisites | lucy-behavior | P0 | edge-case |

### Dummy User Tests (Unexpected Behavior)

| ID | Title | Area | Priority | Type |
|----|-------|------|----------|------|
| TC-DU-001 | Modifies data while Lucy is executing (race conditions) | dummy-user | P0 | edge-case |
| TC-DU-002 | Page refresh during active operations | dummy-user | P0 | edge-case |
| TC-DU-003 | Invalid, empty, and wrong inputs | dummy-user | P0 | edge-case |
| TC-DU-004 | Skips steps or does things out of order | dummy-user | P0 | edge-case |
| TC-DU-005 | Rapid messages, interruptions, and impatience | dummy-user | P1 | edge-case |

### UI Interaction Tests

| ID | Title | Area | Priority | Type |
|----|-------|------|----------|------|
| TC-UI-001 | Tab switching, view modes, navigation during ops | ui-interactions | P0 | regression |
| TC-UI-002 | Topic canvas drag, zoom, toolbar actions | ui-interactions | P1 | happy-path |
| TC-UI-003 | Sidebar pin, collapse, expand with active ops | ui-interactions | P1 | regression |

### Polling & Job Lifecycle Tests

| ID | Title | Area | Priority | Type | Mock Scenario |
|----|-------|------|----------|------|---------------|
| TC-POLL-001 | Network error during active polling | polling | P0 | edge-case | evalPollsBeforeComplete=5 |
| TC-POLL-002 | Page refresh while actively polling | polling | P0 | edge-case | evalPollsBeforeComplete=10 |
| TC-POLL-003 | Multiple simultaneous polling jobs | polling | P0 | edge-case | evalPollsBeforeComplete=5 |
| TC-POLL-004 | Progress updates and UI feedback during polling | polling | P1 | happy-path | evalPollsBeforeComplete=5 |
| TC-POLL-005 | Job cancellation stops polling cleanly | polling | P1 | edge-case | evalPollsBeforeComplete=10 |

### Cross-Cutting Tests

| ID | Title | Area | Priority | Type |
|----|-------|------|----------|------|
| TC-CC-001 | Full Pipeline E2E | cross-cutting | P0 | happy-path |
| TC-CC-002 | Sidebar ↔ Detail Panel Consistency | cross-cutting | P0 | regression |
| TC-CC-003 | Data Persistence Across Refresh | cross-cutting | P0 | regression |
| TC-CC-004 | Stale Data Detection | cross-cutting | P0 | regression |
| TC-CC-005 | Session Resumption / Catch-Up | cross-cutting | P1 | regression |
| TC-CC-006 | Multi-Dataset context switching and data isolation | cross-cutting | P0 | regression |
| TC-CC-007 | Notification badge lifecycle | cross-cutting | P1 | regression |

---

## Coverage Summary

| Area | P0 | P1 | Total |
|------|----|----|-------|
| Topics | 1 | 1 | 2 |
| Categorization | 1 | 0 | 1 |
| Coverage/Gen | 1 | 0 | 1 |
| Grader | 1 | 1 | 2 |
| Evaluation | 3 | 1 | 4 |
| Training | 3 | 1 | 4 |
| Deployment | 1 | 0 | 1 |
| Knowledge Sources | 2 | 0 | 2 |
| Records/Data | 1 | 1 | 2 |
| Dataset CRUD | 1 | 0 | 1 |
| Lucy Behavior | 6 | 2 | 10 |
| Dummy User | 4 | 1 | 5 |
| UI Interactions | 1 | 2 | 3 |
| Polling | 3 | 2 | 5 |
| Cross-Cutting | 5 | 2 | 7 |
| **Total** | **34** | **14** | **50** |

---

## Test Execution Priority

Run in this order for maximum coverage with minimum effort:

### Phase 1: Core Flow (P0 happy paths) — 5 tests
1. TC-DS-001 — Dataset create/rename/delete (entry point)
2. TC-LUCY-001 — Plan generation (starting point for Lucy)
3. TC-CC-001 — Full pipeline E2E (covers all steps)
4. TC-KS-001 — Knowledge source upload (data entry)
5. TC-LUCY-006 — Dataset state awareness (resume behavior)

### Phase 2: Decision Points (P0 edge cases) — 5 tests
6. TC-EVAL-002 — Warning scenario detail
7. TC-EVAL-003 — Critical + stall detection
8. TC-TRN-002 — Overfitting detection
9. TC-TRN-003 — No Learning detection
10. TC-LUCY-013 — Impossible requests

### Phase 3: Dynamic Behavior (P0 interaction) — 5 tests
11. TC-LUCY-002 — Dynamic replanning
12. TC-LUCY-004 — Mid-execution intervention
13. TC-LUCY-007 — Plan rejection
14. TC-LUCY-012 — Plan cancellation mid-execution
15. TC-CC-002 — Sidebar consistency

### Phase 4: Dummy User Scenarios (P0 edge cases) — 5 tests
16. TC-DU-001 — Race conditions (data changes during execution)
17. TC-DU-002 — Page refresh during operations
18. TC-DU-003 — Invalid/empty/wrong inputs
19. TC-DU-004 — Out-of-order actions
20. TC-UI-001 — Tab/view switching during operations

### Phase 5: Polling & Job Lifecycle (P0) — 3 tests
21. TC-POLL-001 — Network error during active polling
22. TC-POLL-002 — Page refresh while actively polling
23. TC-POLL-003 — Multiple simultaneous polling jobs

### Phase 6: Data & State Integrity (P0) — 5 tests
24. TC-KS-002 — Knowledge source processing wait
25. TC-REC-001 — Record CRUD and bulk ops
26. TC-CC-003 — Data persistence across refresh
27. TC-CC-004 — Stale data detection
28. TC-CC-006 — Multi-dataset isolation

### Phase 7: Iteration & Error Handling — 3 tests
29. TC-LUCY-009 — Replanning after iteration
30. TC-EVAL-004 — Eval error
31. TC-TRN-004 — Training error

### Phase 8: Polish & P1 (remaining) — 12 tests
32. TC-DU-005 — Rapid messages/interruptions
33. TC-LUCY-010 — Out-of-scope requests
34. TC-LUCY-011 — New conversation reset
35. TC-CC-005 — Session resumption
36. TC-CC-007 — Notification badge lifecycle
37. TC-POLL-004 — Progress updates during polling
38. TC-POLL-005 — Job cancellation stops polling
39. TC-UI-002 — Topic canvas interactions
40. TC-UI-003 — Sidebar pin/collapse
41. TC-SKL-001 — Skill package
42. TC-GRD-002 — Grader edge cases
43. TC-TOP-002 — Topics edge cases

---

## Test Results

Test results are stored SEPARATELY from test scenarios in `e2e-runs/`.

See [e2e-test-framework.md](../e2e-test-framework.md#test-results-storage) for the results storage format.
