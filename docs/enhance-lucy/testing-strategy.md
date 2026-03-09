# Testing Strategy: Enhanced Lucy Iteration Loops

How to test every piece of the enhanced Lucy feature — from unit tests to full E2E browser automation. Written so any agent (human or AI) can pick this up and verify the implementation.

---

## Current Test Infrastructure

| Component | Framework | Status |
|-----------|-----------|--------|
| **Frontend unit tests** | Vitest 3.2 + @testing-library/react | Active — tool handlers, renderers, helpers |
| **Frontend E2E** | Chrome MCP (manual via `/finetune-e2e`) | 17 issues tracked, no automation |
| **Mock gateway server** | Express + scenario bridges (`src/test/mock-server/`) | Standalone server for Playwright/Chrome E2E |
| **IndexedDB mocking** | fake-indexeddb | Installed, auto-imported in test setup |
| **API mocking (unit)** | Custom mock factory (`finetune-api.mock.ts`) | Configurable delays + scenarios |
| **API mocking (integration)** | MSW 2.x (`src/test/msw/`) | Scenario-based HTTP interception |
| **Integration tests** | Vitest + MSW + fake-indexeddb | Tool handler chain tests (15 tests) |
| **Test fixtures** | Scenario-based factories | Eval, training, iteration history scenarios |
| **Gateway (Rust)** | `#[test]` inline | Minimal, mostly type tests |
| **Distri server (Rust)** | `#[test]` inline + mock LLM | Orchestrator + parser tests |
| **CI/CD** | GitHub Actions | Build-only — **no tests run in CI** |

**Key gaps**: No automated E2E scripts (mock server ready), no API contract tests, no CI test execution.

### Implemented Test Files

```
src/test/
├── setup.ts                          # Vitest setup — fake-indexeddb, @testing-library cleanup
├── fixtures/
│   ├── eval-scenarios.ts             # EVAL_SCENARIOS (healthy/warning/critical/stalled/error)
│   │                                 # ITERATION_HISTORIES (empty/single/improving/stalledThree/stalledFive/mixed)
│   │                                 # makeEvalRecords() factory
│   └── training-scenarios.ts         # TRAINING_SCENARIOS (improving/overfitting/noLearning/error)
├── mocks/
│   └── finetune-api.mock.ts          # mockFinetuneApi() factory with configurable delays
├── msw/                              # MSW infrastructure for integration tests
│   ├── server.ts                     # setupServer() for Vitest (Node.js)
│   ├── browser.ts                    # setupWorker() for dev E2E (browser)
│   ├── setup.ts                      # Vitest lifecycle hooks (beforeAll/afterEach/afterAll)
│   ├── scenarios/
│   │   ├── scenario-registry.ts      # Mutable singleton — tests set scenario, handlers read it
│   │   ├── eval-scenario-bridge.ts   # Eval fixtures → HTTP response shapes
│   │   └── training-scenario-bridge.ts  # Training fixtures → HTTP response shapes
│   └── handlers/
│       ├── index.ts                  # Combines all handler arrays
│       ├── env.ts                    # GET /api/env
│       ├── datasets.ts              # POST /finetune/datasets, PATCH .../evaluator
│       ├── evaluations.ts           # POST/GET /finetune/evaluations (stateful polling)
│       ├── training-jobs.ts         # POST/GET /finetune/reinforcement-jobs
│       ├── finetune-evaluations.ts  # GET .../finetune-evaluations (per-epoch data)
│       └── analytics.ts             # POST .../analytics/dry-run
├── integration/                      # Tool handler chain tests (MSW + IndexedDB)
│   ├── seed-helpers.ts               # IndexedDB seeding utilities
│   ├── eval-analysis.test.ts         # 7 tests — analyze_evaluation scenarios
│   └── training-analysis.test.ts     # 8 tests — analyze_training scenarios (MSW-dependent)
└── mock-server/                      # Standalone Express mock for Playwright/Chrome E2E
    └── server.ts                     # Express server reusing scenario bridges

src/lib/distri-finetune-tools/steps/
└── check-viability.test.ts           # 17 tests — input validation, classification, sample size, errors

src/components/agent/lucy-agent/plan-render/
├── computeStallCount.test.ts         # 10 tests — stall detection helper (edge cases, boundaries)
├── LucyAnalyzeEvalRenderer.test.tsx  # 11 tests — eval card renderer (all scenarios)
└── LucyAnalyzeTrainingRenderer.test.tsx  # 11 tests — training card renderer (all scenarios)
```

### Mock Architecture

**API Mock Factory** (`src/test/mocks/finetune-api.mock.ts`):

```typescript
// Basic usage — 50ms default delay per call
vi.mock('@/services/finetune-api', () => mockFinetuneApi());

// Custom delays and scenarios
vi.mock('@/services/finetune-api', () => mockFinetuneApi({
  delayMs: 100,            // Simulate slower network
  evalShouldFail: true,    // Force eval failure
  uploadShouldFail: true,  // Force upload failure
}));

// Convenience helpers
vi.mock('@/services/finetune-api', () => mockApiWithEvalRecords(records, 50));
vi.mock('@/services/finetune-api', () => mockApiWithFailure(50));
```

**Fixture Scenarios** — Pre-built typed objects matching `AnalyzeEvaluationResult` / `AnalyzeTrainingResult`:

| Fixture | Scenarios | Used By |
|---------|-----------|---------|
| `EVAL_SCENARIOS` | healthy, warning, critical, stalled, error | Renderer tests, tool handler tests |
| `TRAINING_SCENARIOS` | improving, overfitting, noLearning, error | Renderer tests |
| `ITERATION_HISTORIES` | empty, single, improving, stalledThree, stalledFive, mixedThenStalled | computeStallCount tests |
| `makeEvalRecords()` | Generates N records with configurable mean/variance | API mock, tool handler tests |

### MSW Integration Test Architecture

MSW (Mock Service Worker) v2 intercepts HTTP requests at the network level, enabling integration tests that exercise full tool handler chains with real IndexedDB and mocked backend API responses.

```
   Test calls tool handlers directly
                 ↓
   Tool Handlers (analyze_evaluation, analyze_training, etc.)
         ↓                              ↓
    IndexedDB                    fetch() to localhost:8080
  (fake-indexeddb)                      ↓
                              MSW intercepts HTTP
                                        ↓
                              Scenario Registry decides response
                                        ↓
                              Bridges convert fixtures → HTTP shapes
```

**Scenario Registry** (`src/test/msw/scenarios/scenario-registry.ts`):

```typescript
import { setScenario, resetScenario } from '../msw/scenarios/scenario-registry';

// Set scenario before calling tool handlers
setScenario({
  trainingScenario: 'overfitting',    // or 'improving' | 'noLearning' | 'error'
  evalScenario: 'healthy',            // or 'warning' | 'critical' | 'stalled' | 'error'
  trainingPollsBeforeComplete: 0,     // 0 = instant completion
  evalPollsBeforeComplete: 2,         // 2 polls before completing
});

// Reset in afterEach (automatic via MSW setup.ts)
resetScenario();
```

**Seed Helpers** (`src/test/integration/seed-helpers.ts`):

```typescript
const datasetId = await seedDataset({ backendDatasetId: 'ds-001' });
await seedRecords(datasetId, [
  { id: 'row-0', topic: 'Pins' },
  { id: 'row-1', topic: 'Forks' },
]);
await seedWorkflow(datasetId, { jobId: 'ft-job-001' });
await seedCompletedDryRunJob(datasetId, { scores: [...] });
await seedIterationHistory(datasetId, history);
```

**Integration Test Catalog**:

| Test File | Tests | What it exercises |
|-----------|-------|-------------------|
| `eval-analysis.test.ts` | 7 | analyze_evaluation: healthy/train, warning/iterate, critical/binary, stalled/escalate, error, per-topic, recommendations |
| `training-analysis.test.ts` | 8 | analyze_training (MSW): improving/deploy, overfitting/investigate, noLearning/inner_loop, failed/retrain, per-topic progressions, overall progression, error cases |

**Dev Server with MSW** (`pnpm dev:msw`): Starts Vite with `VITE_MSW_ENABLED=true`, enabling the browser service worker for interactive scenario testing without a real backend.

### Mock Express Server (Playwright/Chrome E2E)

A standalone Express server that replaces the real vLLora gateway for Playwright or Chrome MCP-based E2E tests. Reuses the same scenario registry and response bridges as MSW, but works over real HTTP (not in-process interception).

```
   Playwright / Chrome MCP
              ↓
   React UI (localhost:5173)
         ↓  fetch()
   Mock Express Server (localhost:9090)
         ↓  reads
   Scenario Registry (same as MSW)
         ↓  builds response
   Scenario Bridges (eval + training)
```

**Start the mock server**:

```bash
pnpm mock-server           # Runs on port 9090 (default)
pnpm mock-server:9090      # Explicit port
npx tsx src/test/mock-server/server.ts --port 8080  # Custom port
```

**Control API** (switch scenarios at runtime via HTTP):

```bash
# Set scenario (any ScenarioState fields + optional mockDatasetId)
curl -X POST http://localhost:9090/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"warning","trainingScenario":"overfitting","mockDatasetId":"my-test-ds"}'

# Get current scenario
curl http://localhost:9090/mock/scenario

# Reset to defaults (clears all tracked data)
curl -X POST http://localhost:9090/mock/reset

# List tracked mock datasets
curl http://localhost:9090/mock/datasets
```

**Dataset ID Tracking**:

The mock server generates deterministic IDs (`mock-ds-001`, `mock-ds-002`, ...) that are distinguishable from real backend IDs. This prevents polling conflicts when switching between mock and real API:

| Source | ID Pattern | Example |
|--------|-----------|---------|
| Mock server | `mock-ds-NNN` | `mock-ds-001` |
| Custom override | Any string | `my-test-dataset` |
| Real backend | UUID or `ds-*` | `ds-abc123` |

Set a custom ID: `POST /mock/scenario {"mockDatasetId": "custom-id"}`

**Supported endpoints** (mirrors real gateway):

| Method | Endpoint | Scenario-dependent? |
|--------|----------|-------------------|
| GET | `/api/env` | No — returns mock port config |
| POST | `/finetune/datasets` | `uploadBehavior` |
| PATCH | `/finetune/datasets/:id/evaluator` | No |
| POST | `/finetune/evaluations` | `evalCreateBehavior` |
| GET | `/finetune/evaluations/:id` | `evalScenario` + poll counter |
| POST | `/finetune/reinforcement-jobs` | `trainingCreateBehavior` |
| GET | `/finetune/reinforcement-jobs/:id/status` | `trainingScenario` + poll counter |
| GET | `/finetune/reinforcement-jobs` | `trainingScenario` |
| GET | `/finetune/datasets/:id/finetune-evaluations` | `trainingScenario` |
| POST | `/finetune/datasets/analytics/dry-run` | No — static response |
| POST | `/finetune/reinforcement-jobs/:id/cancel` | No |
| POST | `/finetune/reinforcement-jobs/:id/resume` | No |
| GET | `/finetune/reinforcement-jobs/:id/weights/url` | No |

---

## Test Pyramid for Enhanced Lucy

```
                    ┌─────────────┐
                    │  E2E Tests  │  ← Chrome MCP browser automation
                    │  (5-8 tests)│  ← Full iteration loop scenarios
                    ├─────────────┤
                 ┌──┤ Integration │  ← Tool → IndexedDB → API mock round-trips
                 │  │ (10-15)     │  ← Agent instructions → tool execution chains
                 │  ├─────────────┤
              ┌──┤  │ Unit Tests  │  ← Tool handlers, analysis logic, state stores
              │  │  │ (20-30)     │  ← Stall detection, score classification, catch-up protocol
              │  │  └─────────────┘
              │  └─── Integration tests verify tool chains work together
              └────── Unit tests verify individual functions in isolation
```

---

## What to Test (By Phase)

### Phase 1: Give Lucy Eyes

| What | Test Type | What to Verify |
|------|-----------|----------------|
| `get_evaluation_details` tool | Unit | Returns per-record scores, grader reasons, per-topic breakdown |
| `get_evaluation_details` tool | Unit | Sorts by score ascending/descending |
| `get_evaluation_details` tool | Unit | Filters by topic |
| `get_evaluation_details` tool | Unit | Handles empty eval results gracefully |
| `log_iteration` tool | Unit | Writes iteration record to IndexedDB |
| `log_iteration` tool | Unit | Increments iteration number correctly |
| `get_iteration_history` tool | Unit | Returns all iterations for a dataset in order |
| `get_iteration_history` tool | Unit | Returns empty array for new datasets |
| IterationState IndexedDB store | Unit | CRUD operations on iteration state |
| IterationState IndexedDB store | Unit | Persists across simulated page refreshes |
| `reviewedByAgent` flag | Unit | Defaults to `false` on job completion |
| `reviewedByAgent` flag | Unit | Set to `true` when agent reviews |
| Catch-up protocol | Integration | Detects unreviewed completed jobs on dataset open |
| Catch-up protocol | Integration | Detects failed jobs and presents error context |
| Catch-up protocol | Integration | Detects pending proposals from previous session |
| Catch-up protocol | Integration | Shows normal summary when nothing pending |
| Notification badge | E2E | Badge appears when unreviewed results exist |
| Notification badge | E2E | Badge disappears after Lucy presents results |

### Phase 2: Give Lucy Autonomy (Inner Loop)

| What | Test Type | What to Verify |
|------|-----------|----------------|
| Post-eval analysis | Unit | Classifies dry run score health correctly (healthy, too_easy, too_hard) |
| Post-eval analysis | Unit | Identifies weak topics (avg < 0.5) |
| Post-eval analysis | Unit | Identifies strong topics (avg > 0.7) |
| Post-eval analysis | Unit | Computes delta from previous iteration |
| Post-eval analysis | Unit | Detects stall (abs(delta) < 0.03 for 3 iterations) |
| `regenerate_topic` step | Integration | Regenerates data for specific weak topics only |
| `adjust_grader` step | Integration | Modifies grader based on analysis |
| `analyze` step | Integration | Runs full analysis pipeline and returns structured result |
| Re-plan flow | Integration | Agent proposes new plan after analysis |
| Re-plan flow | Integration | New plan targets only changed topics (not full re-run) |
| Inner loop E2E | E2E | Full iteration: eval → analyze → propose → approve → re-eval |
| Inner loop E2E | E2E | User modifies proposal before applying |
| Inner loop E2E | E2E | User rejects proposal and provides alternative |

### Phase 3: Give Lucy Wisdom (Outer Loop)

| What | Test Type | What to Verify |
|------|-----------|----------------|
| Post-training analysis | Unit | Detects improving epoch scores |
| Post-training analysis | Unit | Detects overfitting (epoch N < epoch N-1) |
| Post-training analysis | Unit | Detects reward hacking (training up, eval quality down) |
| Post-training dry run eval | Integration | Runs eval on fine-tuned model |
| Post-training comparison | Integration | Compares fine-tuned model scores vs base model scores |
| Stall detection (all 10 patterns) | Unit | Each of the 10 stall patterns from rft-decision-tree.md |
| Escalation suggestions | Unit | Correct lever suggested for each stall pattern |

### Phase 4: Give Lucy Hands

| What | Test Type | What to Verify |
|------|-----------|----------------|
| Custom grader editing | Integration | Agent writes raw JS grader code |
| Task viability pre-check | Integration | Base model tested on sample prompts |
| Task viability pre-check | Unit | Viability classification (ready, marginal, not_ready) |

---

## Unit Test Specifications

### Test File Locations

Tests live next to source files (co-located pattern):

```
src/test/                              # Shared test infrastructure
  setup.ts                             # Vitest global setup (fake-indexeddb, cleanup)
  fixtures/                            # Typed test data factories
    eval-scenarios.ts                  # Eval + iteration history fixtures
    training-scenarios.ts              # Training scenario fixtures
  mocks/
    finetune-api.mock.ts               # API mock factory with delays

src/lib/distri-finetune-tools/steps/
  check-viability.test.ts              # ✅ Viability tool handler unit tests (14 tests)

src/components/agent/lucy-agent/plan-render/
  computeStallCount.test.ts            # ✅ Stall detection unit tests (10 tests)
  LucyAnalyzeEvalRenderer.test.tsx     # ✅ Eval renderer component tests (11 tests)
  LucyAnalyzeTrainingRenderer.test.tsx # ✅ Training renderer component tests (11 tests)

# Planned (not yet implemented):
src/lib/distri-finetune-tools/__tests__/
  iteration-loop.integration.test.ts   # Inner loop integration
  training-loop.integration.test.ts    # Outer loop integration
```

### Test Framework Setup

```typescript
// vitest.config.ts — already configured:
// - globals: true (describe, it, expect available)
// - environment: jsdom
// - setupFiles: ['./src/test/setup.ts']

// src/test/setup.ts includes:
import 'fake-indexeddb/auto';          // IndexedDB polyfill for tests
import '@testing-library/jest-dom/vitest';  // DOM matchers
import { cleanup } from '@testing-library/react';
afterEach(() => cleanup());
```

### Example: `get_evaluation_details` Unit Tests

```typescript
// src/lib/distri-finetune-tools/steps/get-evaluation-details/handler.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEvaluationDetailsHandler } from './handler';

// Mock the API service
vi.mock('@/services/finetune-api', () => ({
  getEvaluationResult: vi.fn(),
}));

// Mock IndexedDB dataset records
vi.mock('@/services/datasets-db', () => ({
  getRecordsByDatasetId: vi.fn(),
}));

describe('get_evaluation_details', () => {
  const mockEvalResult = {
    evaluation_run_id: 'eval-123',
    status: 'completed',
    total_rows: 10,
    completed_rows: 10,
    failed_rows: 0,
    results: [
      {
        row_index: 0,
        row: { id: 'pins-003' },
        epochs: {
          '0': [{ score: 0.15, reason: 'Response discusses forks, not pins', status: 'failed' }],
        },
      },
      {
        row_index: 1,
        row: { id: 'forks-001' },
        epochs: {
          '0': [{ score: 0.85, reason: 'Good explanation of fork tactics', status: 'passed' }],
        },
      },
      // ... more records with topic metadata
    ],
    summary: { average_score: 0.45, passed_count: 4, failed_count: 6 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns per-topic breakdown with average scores', async () => {
    // Setup mock
    const { getEvaluationResult } = await import('@/services/finetune-api');
    vi.mocked(getEvaluationResult).mockResolvedValue(mockEvalResult);

    const result = await getEvaluationDetailsHandler({
      evaluation_id: 'eval-123',
    });

    expect(result.success).toBe(true);
    expect(result.per_topic).toBeDefined();
    expect(result.per_topic.length).toBeGreaterThan(0);
    // Each topic should have avg_score, count, worst_record
    for (const topic of result.per_topic) {
      expect(topic).toHaveProperty('topic');
      expect(topic).toHaveProperty('avg_score');
      expect(topic).toHaveProperty('count');
    }
  });

  it('sorts records by score ascending by default', async () => {
    const { getEvaluationResult } = await import('@/services/finetune-api');
    vi.mocked(getEvaluationResult).mockResolvedValue(mockEvalResult);

    const result = await getEvaluationDetailsHandler({
      evaluation_id: 'eval-123',
      sort_by: 'score_asc',
    });

    const scores = result.worst_records.map(r => r.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });

  it('filters by topic when topic_filter provided', async () => {
    const { getEvaluationResult } = await import('@/services/finetune-api');
    vi.mocked(getEvaluationResult).mockResolvedValue(mockEvalResult);

    const result = await getEvaluationDetailsHandler({
      evaluation_id: 'eval-123',
      topic_filter: 'pins',
    });

    for (const record of result.worst_records) {
      expect(record.topic).toBe('pins');
    }
  });

  it('handles empty evaluation results', async () => {
    const { getEvaluationResult } = await import('@/services/finetune-api');
    vi.mocked(getEvaluationResult).mockResolvedValue({
      ...mockEvalResult,
      results: [],
      summary: null,
    });

    const result = await getEvaluationDetailsHandler({
      evaluation_id: 'eval-123',
    });

    expect(result.success).toBe(true);
    expect(result.per_topic).toEqual([]);
    expect(result.worst_records).toEqual([]);
  });

  it('respects limit parameter', async () => {
    const { getEvaluationResult } = await import('@/services/finetune-api');
    vi.mocked(getEvaluationResult).mockResolvedValue(mockEvalResult);

    const result = await getEvaluationDetailsHandler({
      evaluation_id: 'eval-123',
      limit: 3,
    });

    expect(result.worst_records.length).toBeLessThanOrEqual(3);
  });
});
```

### Example: Stall Detection Unit Tests

```typescript
// src/lib/distri-finetune-tools/steps/analyze-evaluation/stall-detection.test.ts

import { describe, it, expect } from 'vitest';
import { detectStall, type IterationHistoryEntry } from './stall-detection';

function makeHistory(scores: number[]): IterationHistoryEntry[] {
  return scores.map((mean, i) => ({
    iteration: i + 1,
    timestamp: new Date(Date.now() - (scores.length - i) * 3600000).toISOString(),
    evalId: `eval-${i}`,
    dryRunScores: { mean, perTopic: { pins: mean - 0.1, forks: mean + 0.1 } },
    changesMade: `iteration ${i + 1} changes`,
    decision: 'iterate' as const,
  }));
}

describe('stall detection', () => {
  it('pattern 1: detects flat scores (plateau)', () => {
    const history = makeHistory([0.45, 0.46, 0.44, 0.45]);
    const stall = detectStall(history);
    expect(stall).not.toBeNull();
    expect(stall!.pattern).toBe('plateau');
  });

  it('pattern 2: detects topic regression', () => {
    const history = makeHistory([0.45, 0.50, 0.55]);
    // Override last iteration to have a topic that regressed
    history[2].dryRunScores.perTopic = { pins: 0.60, forks: 0.35 }; // forks dropped from 0.60
    history[1].dryRunScores.perTopic = { pins: 0.50, forks: 0.60 };

    const stall = detectStall(history);
    expect(stall).not.toBeNull();
    expect(stall!.pattern).toBe('topic_regression');
    expect(stall!.details).toContain('forks');
  });

  it('pattern 3: detects high variance within topic', () => {
    const history = makeHistory([0.45, 0.48, 0.50]);
    // Add per-record variance info
    history[2].dryRunScores.perTopic = { pins: 0.50 };
    // Simulate high std by adding stdPerTopic
    history[2].dryRunScores.stdPerTopic = { pins: 0.30 };

    const stall = detectStall(history);
    expect(stall).not.toBeNull();
    expect(stall!.pattern).toBe('high_variance');
  });

  it('pattern 5: detects binary scores (0 or 1 only)', () => {
    const history = makeHistory([0.45, 0.48, 0.50]);
    history[2].dryRunScores.binaryRate = 0.85; // 85% of scores are 0 or 1

    const stall = detectStall(history);
    expect(stall).not.toBeNull();
    expect(stall!.pattern).toBe('binary_scores');
  });

  it('pattern 7: detects base model failure', () => {
    // First iteration, all topics below 0.3
    const history = makeHistory([0.15]);
    history[0].dryRunScores.perTopic = { pins: 0.10, forks: 0.12, combos: 0.18 };

    const stall = detectStall(history);
    expect(stall).not.toBeNull();
    expect(stall!.pattern).toBe('base_model_failure');
  });

  it('returns null when scores are improving normally', () => {
    const history = makeHistory([0.35, 0.45, 0.55]);
    const stall = detectStall(history);
    expect(stall).toBeNull();
  });

  it('returns null with fewer than 3 iterations (not enough data)', () => {
    const history = makeHistory([0.35, 0.45]);
    const stall = detectStall(history);
    expect(stall).toBeNull();
  });
});
```

### Example: Catch-Up Protocol Tests

```typescript
// src/hooks/useFineTuneAgentChat.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { determineCatchUpAction, type CatchUpAction } from './catch-up-protocol';

// Mock IndexedDB queries
vi.mock('@/services/finetune-workflow-db', () => ({
  getWorkflowByDataset: vi.fn(),
}));
vi.mock('@/services/dry-run-jobs-db', () => ({
  getJobsByDatasetId: vi.fn(),
}));
vi.mock('@/services/finetune-iteration-db', () => ({
  getIterationState: vi.fn(),
}));

describe('catch-up protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns "present_results" when unreviewed completed job exists', async () => {
    const { getJobsByDatasetId } = await import('@/services/dry-run-jobs-db');
    vi.mocked(getJobsByDatasetId).mockResolvedValue([
      { id: 'job-1', status: 'completed', reviewedByAgent: false, completedAt: Date.now() },
    ]);

    const action = await determineCatchUpAction('dataset-123');
    expect(action.type).toBe('present_results');
    expect(action.jobId).toBe('job-1');
  });

  it('returns "present_error" when failed job exists', async () => {
    const { getJobsByDatasetId } = await import('@/services/dry-run-jobs-db');
    vi.mocked(getJobsByDatasetId).mockResolvedValue([
      { id: 'job-1', status: 'failed', reviewedByAgent: false, error: 'Grader threw TypeError' },
    ]);

    const action = await determineCatchUpAction('dataset-123');
    expect(action.type).toBe('present_error');
    expect(action.error).toContain('TypeError');
  });

  it('returns "re_present_proposal" when pending iteration proposal exists', async () => {
    const { getIterationState } = await import('@/services/finetune-iteration-db');
    vi.mocked(getIterationState).mockResolvedValue({
      id: 'dataset-123',
      iterationNumber: 2,
      phase: 'awaiting_user',
      innerLoop: {
        proposedChanges: [{ lever: 'records', description: 'Fix pin prompts', applied: false }],
      },
    });

    const action = await determineCatchUpAction('dataset-123');
    expect(action.type).toBe('re_present_proposal');
    expect(action.iterationNumber).toBe(2);
  });

  it('returns "show_progress" when job is still running', async () => {
    const { getJobsByDatasetId } = await import('@/services/dry-run-jobs-db');
    vi.mocked(getJobsByDatasetId).mockResolvedValue([
      { id: 'job-1', status: 'running', reviewedByAgent: false, completedRows: 45, totalRows: 132 },
    ]);

    const action = await determineCatchUpAction('dataset-123');
    expect(action.type).toBe('show_progress');
  });

  it('returns "show_summary" when nothing pending', async () => {
    const { getJobsByDatasetId } = await import('@/services/dry-run-jobs-db');
    vi.mocked(getJobsByDatasetId).mockResolvedValue([]);

    const { getIterationState } = await import('@/services/finetune-iteration-db');
    vi.mocked(getIterationState).mockResolvedValue(null);

    const action = await determineCatchUpAction('dataset-123');
    expect(action.type).toBe('show_summary');
  });

  it('prioritizes failed jobs over completed jobs', async () => {
    const { getJobsByDatasetId } = await import('@/services/dry-run-jobs-db');
    vi.mocked(getJobsByDatasetId).mockResolvedValue([
      { id: 'job-1', status: 'completed', reviewedByAgent: false },
      { id: 'job-2', status: 'failed', reviewedByAgent: false, error: 'timeout' },
    ]);

    const action = await determineCatchUpAction('dataset-123');
    expect(action.type).toBe('present_error');
  });
});
```

---

## Integration Test Specifications

Integration tests verify that tool chains work together — a tool writes to IndexedDB, another tool reads it, and the result is correct.

### Test File Location

```
src/lib/distri-finetune-tools/__tests__/
  iteration-loop.integration.test.ts     ← Inner loop: eval → analyze → propose → apply
  session-resumption.integration.test.ts ← Catch-up protocol end-to-end
  training-loop.integration.test.ts      ← Outer loop: train → analyze → post-eval
```

### Example: Inner Loop Integration Test

```typescript
// src/lib/distri-finetune-tools/__tests__/iteration-loop.integration.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

// Test the full inner loop: eval completes → get details → log iteration → compare with history

describe('inner loop integration', () => {
  beforeEach(async () => {
    // Clear IndexedDB stores
    // Setup test dataset with records and topics
  });

  it('iteration 1: eval → analyze → log → propose changes', async () => {
    // 1. Simulate eval completion with mock API response
    // 2. Call get_evaluation_details → verify per-topic breakdown
    // 3. Call get_iteration_history → verify empty (first iteration)
    // 4. Call log_iteration with scores and decision
    // 5. Call get_iteration_history again → verify iteration 1 recorded
    // 6. Verify proposed changes target weak topics
  });

  it('iteration 2: eval → analyze → compare with iteration 1 → detect improvement', async () => {
    // 1. Setup: iteration 1 already logged (pins=0.22, forks=0.68)
    // 2. Simulate iteration 2 eval (pins=0.41, forks=0.65)
    // 3. Call get_evaluation_details → verify new scores
    // 4. Call get_iteration_history → verify iteration 1 exists
    // 5. Compare: pins improved +0.19, forks regressed -0.03
    // 6. Verify analysis flags forks regression
  });

  it('iteration 3: scores plateau → stall detected → escalation suggested', async () => {
    // 1. Setup: iterations 1-2 logged with similar scores
    // 2. Simulate iteration 3 with nearly identical scores
    // 3. Call analyze → verify stall pattern detected
    // 4. Verify escalation suggestion (change approach)
  });

  it('scores reach healthy range → transition to training', async () => {
    // 1. Setup: multiple iterations showing improvement
    // 2. Final eval: mean=0.55, all topics > 0.4
    // 3. Verify analysis recommends "proceed to training"
    // 4. Verify workflow state can advance to training step
  });
});
```

---

## E2E Test Specifications

E2E tests run in the browser against the full stack. Uses Chrome MCP (Claude in Chrome) tools.

### Prerequisites

```bash
# Start all services
npm run dev                    # Frontend → localhost:5173
npm run start:backend          # Gateway → localhost:9090, Distri → localhost:8081

# Auth setup (in browser console)
localStorage.setItem('vlora_user_email', 'test@e2e.local');
```

### E2E Test Scenarios

#### Scenario 1: Full Inner Loop (Happy Path)

**Goal:** Verify Lucy can run the complete inner dataset iteration loop.

```
Steps:
1. Navigate to localhost:5173
2. Create new dataset "Chess Tutor E2E Test"
3. Add objective: "Teach chess tactics: pins, forks, combinations"
4. Upload knowledge source (chess PDF)
5. Start Lucy chat: "Help me build a finetune dataset"
6. Lucy proposes plan → Approve
7. Lucy executes: topics → categorize → generate → grader → upload → dry run eval
8. WAIT for eval to complete (poll every 6s)
9. VERIFY: Lucy presents per-topic breakdown (not just avg score)
10. VERIFY: Lucy identifies weak topics with grader reasons
11. VERIFY: Lucy proposes targeted changes (e.g., "fix pin prompts")
12. Approve changes
13. VERIFY: Lucy executes targeted regeneration (only pins, not everything)
14. VERIFY: Lucy re-runs evaluation
15. VERIFY: Lucy shows cross-iteration comparison (iteration 1 vs 2)
16. VERIFY: Lucy shows score delta per topic

Expected outcome:
- Lucy runs at least 2 iterations
- Each iteration shows per-topic scores
- Cross-iteration delta is displayed
- Weak topics are identified with reasons
```

**Verification points (Chrome MCP):**
```
find("per-topic")           → Score breakdown visible
find("iteration")           → Iteration number visible
find("delta" OR "improved") → Cross-iteration comparison visible
find("Accept")              → Action buttons present
screenshot()                → Visual verification of iteration checkpoint
```

#### Scenario 2: User Intervenes in Proposal

**Goal:** Verify Lucy handles user modifications to proposed changes.

```
Steps:
1-8. Same as Scenario 1
9. Lucy proposes: "Regenerate pin prompts + add combinations"
10. User replies: "Only fix pins, don't change combinations"
11. VERIFY: Lucy acknowledges modification
12. VERIFY: Lucy executes only pin changes
13. VERIFY: Combinations data is unchanged in the re-evaluation
```

#### Scenario 3: Stall Detection

**Goal:** Verify Lucy detects score plateau and suggests escalation.

```
Steps:
1. Setup dataset with intentionally hard task (e.g., model too weak)
2. Run 3 iterations with minimal improvement
3. VERIFY: Lucy detects stall pattern after iteration 3
4. VERIFY: Lucy suggests escalation (change approach / try different model)
5. VERIFY: Lucy presents escalation options with reasoning
```

#### Scenario 4: Session Resumption — Job Completed While Away

**Goal:** Verify Lucy catches up when user returns after job completion.

```
Steps:
1. Start evaluation job
2. Navigate away to a different dataset
3. Wait for job to complete (watch DryRunPollingManager in console)
4. Navigate back to original dataset
5. VERIFY: Lucy shows "Welcome back" message
6. VERIFY: Lucy presents completed results with analysis
7. VERIFY: reviewedByAgent flag is set to true after presentation
8. VERIFY: No notification badge after Lucy presents results
```

**Verification points (Chrome MCP):**
```
find("Welcome back")            → Catch-up message visible
find("completed" OR "results")  → Results presented
javascript_tool("
  // Check IndexedDB for reviewedByAgent flag
  const db = await indexedDB.open('vllora-db');
  // ... query dry run jobs for reviewedByAgent === true
")
```

#### Scenario 5: Session Resumption — Job Failed While Away

**Goal:** Verify Lucy diagnoses failures and suggests fixes.

```
Steps:
1. Configure a grader with a bug (e.g., missing field access)
2. Start evaluation
3. Navigate away
4. Wait for job to fail
5. Navigate back
6. VERIFY: Lucy shows error with diagnosis
7. VERIFY: Lucy suggests specific fix (e.g., "grader accesses missing 'notation' field")
8. VERIFY: Lucy offers action buttons (Fix Grader, Regenerate Records)
```

#### Scenario 6: Session Resumption — Mid-Iteration (Pending Proposal)

**Goal:** Verify Lucy re-presents pending proposals from previous session.

```
Steps:
1. Run iteration 1 → eval completes → Lucy proposes changes
2. DO NOT respond to proposal
3. Close browser entirely
4. Reopen app, navigate to dataset
5. VERIFY: Lucy says "We were in the middle of Iteration 2"
6. VERIFY: Lucy re-presents the same proposal
7. VERIFY: Action buttons work (Accept, Review Again, Start Fresh)
```

#### Scenario 7: Progressive Background Transition

**Goal:** Verify Lucy offers background mode for long-running jobs.

```
Steps:
1. Start evaluation
2. Stay on page, watch Lucy's messages
3. VERIFY: 0-15s: Lucy shows inline progress ("Evaluating 12/132...")
4. VERIFY: 30-60s: Lucy offers "You can keep watching or work on something else"
5. VERIFY: 60s+: Lucy offers explicit buttons [Continue Watching] [Work on Other Datasets]
6. Click "Work on Other Datasets"
7. VERIFY: Navigate away, but polling continues
8. Return later → VERIFY: catch-up message with results
```

#### Scenario 8: Outer Loop — Post-Training Analysis

**Goal:** Verify Lucy analyzes training results and runs post-training eval.

```
Steps:
1. Complete inner loop (scores healthy, proceed to training)
2. Start training job
3. Wait for training to complete
4. VERIFY: Lucy presents training scores per epoch per topic
5. VERIFY: Lucy checks for overfitting
6. VERIFY: Lucy recommends post-training dry run eval
7. Approve post-training eval
8. VERIFY: Lucy compares fine-tuned model vs base model scores
9. VERIFY: Lucy recommends deploy if fine-tuned >> base
```

---

## API Mock Strategy (For Isolated Testing)

When testing without the real backend, mock these endpoints:

### Evaluation Mocks

```typescript
// Mock: POST /finetune/evaluations
const mockCreateEvaluation = {
  evaluation_run_id: 'eval-mock-001',
  status: 'running',
  total_rows: 20,
};

// Mock: GET /finetune/evaluations/{id} — simulate progress over polls
function mockGetEvaluationResult(pollCount: number) {
  if (pollCount < 3) {
    return {
      evaluation_run_id: 'eval-mock-001',
      status: 'running',
      total_rows: 20,
      completed_rows: pollCount * 7,
      failed_rows: 0,
      results: [],
      summary: null,
    };
  }
  return {
    evaluation_run_id: 'eval-mock-001',
    status: 'completed',
    total_rows: 20,
    completed_rows: 20,
    failed_rows: 0,
    results: [
      {
        row_index: 0,
        row: { id: 'pins-003' },
        epochs: {
          '0': [{ score: 0.15, reason: 'Response discusses forks, not pins', status: 'failed' }],
        },
      },
      {
        row_index: 1,
        row: { id: 'forks-001' },
        epochs: {
          '0': [{ score: 0.85, reason: 'Good explanation of fork tactics', status: 'passed' }],
        },
      },
      // ... 18 more records with various scores and topics
    ],
    summary: { average_score: 0.45, passed_count: 8, failed_count: 12 },
  };
}
```

### Training Job Mocks

```typescript
// Mock: POST /finetune/reinforcement-jobs
const mockCreateJob = {
  id: 'job-mock-001',
  provider_job_id: 'langdb-mock-001',
  status: 'pending',
  base_model: 'gpt-4o-mini',
  created_at: new Date().toISOString(),
};

// Mock: GET /finetune/reinforcement-jobs/{id}/status
function mockGetJobStatus(elapsed: number) {
  if (elapsed < 30000) return { status: 'pending' };
  if (elapsed < 120000) return { status: 'running' };
  return { status: 'succeeded', fine_tuned_model: 'ft:gpt-4o-mini:org::mock123' };
}

// Mock: GET /finetune/datasets/{id}/finetune-evaluations
const mockFinetuneEvals = {
  results: [
    {
      row_index: 0,
      epochs: {
        '1': [{ score: 0.35 }],
        '2': [{ score: 0.52 }],
      },
    },
    // ... per-record epoch scores
  ],
};
```

### SSE Mock

```typescript
// Mock: GET /events (Server-Sent Events)
function mockSSEStream() {
  // Emit job status updates at intervals
  const events = [
    { delay: 5000, data: { type: 'finetune_job_update', job_id: 'job-mock-001', status: 'running' } },
    { delay: 30000, data: { type: 'finetune_job_update', job_id: 'job-mock-001', status: 'succeeded' } },
  ];
  // Return EventSource mock that emits these events
}
```

### How to Intercept

**Option A: Vitest (unit/integration tests)**
```typescript
vi.mock('@/services/finetune-api', () => ({
  createEvaluation: vi.fn().mockResolvedValue(mockCreateEvaluation),
  getEvaluationResult: vi.fn().mockImplementation(() => mockGetEvaluationResult(pollCount++)),
  // ... other endpoints
}));
```

**Option B: Playwright route interception (if we add Playwright)**
```typescript
await page.route('**/finetune/evaluations', (route) => {
  route.fulfill({ json: mockCreateEvaluation });
});
await page.route('**/finetune/evaluations/*', (route) => {
  route.fulfill({ json: mockGetEvaluationResult(pollCount++) });
});
```

**Option C: Chrome MCP (current E2E approach)**
```javascript
// Override fetch in browser console before test
javascript_tool(`
  const originalFetch = window.fetch;
  window.fetch = async (url, options) => {
    if (url.includes('/finetune/evaluations') && options?.method === 'POST') {
      return new Response(JSON.stringify(${JSON.stringify(mockCreateEvaluation)}));
    }
    return originalFetch(url, options);
  };
`);
```

---

## Test Data Fixtures

### Chess Tutor Dataset (Standard Test Fixture)

Used across all test scenarios. Covers the full topic hierarchy with known weak/strong areas.

```typescript
// src/test/fixtures/chess-tutor-dataset.ts

export const CHESS_TUTOR_FIXTURE = {
  dataset: {
    id: 'test-chess-001',
    name: 'Chess Tutor E2E',
    datasetObjective: 'Teach chess tactics: pins, forks, combinations, endgames',
    model: 'gpt-4o-mini',
  },
  topics: [
    { id: 'pins', name: 'Pin Tactics', targetCount: 10, description: 'Absolute and relative pins' },
    { id: 'forks', name: 'Fork Tactics', targetCount: 11, description: 'Knight forks, pawn forks' },
    { id: 'combos', name: 'Combinations', targetCount: 8, description: 'Multi-move combinations' },
    { id: 'endgame', name: 'Endgame Technique', targetCount: 6, description: 'King and pawn endings' },
  ],
  // Iteration 1: pins are weak, forks are strong
  iteration1Scores: {
    mean: 0.45,
    perTopic: { pins: 0.22, forks: 0.68, combos: 0.40, endgame: 0.50 },
    weakTopics: ['pins', 'combos'],
    strongTopics: ['forks'],
  },
  // Iteration 2: pins improved after fix, forks slightly regressed
  iteration2Scores: {
    mean: 0.58,
    perTopic: { pins: 0.41, forks: 0.65, combos: 0.52, endgame: 0.55 },
    deltas: { pins: +0.19, forks: -0.03, combos: +0.12, endgame: +0.05 },
  },
  // Iteration 3: healthy enough for training
  iteration3Scores: {
    mean: 0.62,
    perTopic: { pins: 0.55, forks: 0.67, combos: 0.58, endgame: 0.60 },
    verdict: 'healthy',
  },
  // Training results
  trainingScores: {
    epoch1: { pins: 0.35, forks: 0.70, combos: 0.42, endgame: 0.40 },
    epoch2: { pins: 0.52, forks: 0.73, combos: 0.55, endgame: 0.58 },
    verdict: 'improving',
  },
  // Post-training eval (fine-tuned vs base)
  postTrainingComparison: {
    fineTuned: { pins: 0.65, forks: 0.80, combos: 0.62, endgame: 0.70 },
    base: { pins: 0.22, forks: 0.68, combos: 0.40, endgame: 0.50 },
    verdict: 'fine_tuned_significantly_better',
  },
};
```

### Stall Dataset (Edge Case Fixture)

For testing stall detection and escalation.

```typescript
export const STALL_FIXTURE = {
  // Plateau: 3 iterations with < 0.03 improvement
  plateau: {
    history: [
      { iteration: 1, scores: { mean: 0.45, perTopic: { a: 0.45, b: 0.45 } } },
      { iteration: 2, scores: { mean: 0.46, perTopic: { a: 0.47, b: 0.45 } } },
      { iteration: 3, scores: { mean: 0.44, perTopic: { a: 0.44, b: 0.44 } } },
    ],
    expectedPattern: 'plateau',
    expectedSuggestion: 'Change approach — consider grader rewrite or scope narrowing',
  },
  // Binary scores: 85% are 0 or 1
  binaryScores: {
    records: Array.from({ length: 20 }, (_, i) => ({
      score: i < 17 ? (i % 2 === 0 ? 0 : 1) : 0.5,
      // 17 out of 20 records are 0 or 1 = 85%
    })),
    expectedPattern: 'binary_scores',
    expectedSuggestion: 'Add partial credit to grader (Lever 1)',
  },
  // Base model failure: all topics < 0.3 on first eval
  baseModelFailure: {
    history: [
      { iteration: 1, scores: { mean: 0.15, perTopic: { a: 0.10, b: 0.12, c: 0.18 } } },
    ],
    expectedPattern: 'base_model_failure',
    expectedSuggestion: 'Task too hard for this model — try a larger base model',
  },
};
```

---

## Tool Contract Tests

Verify that agent md tool definitions match frontend tool implementations.

```typescript
// src/lib/distri-finetune-tools/__tests__/tool-contracts.test.ts

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { allFinetuneTools } from '../index';

describe('tool contract: agent md matches frontend implementation', () => {
  const agentMd = readFileSync(
    '../../gateway/agents/finetune/finetune-workflow-agent.md',
    'utf-8'
  );

  it('every tool defined in agent md has a frontend handler', () => {
    // Parse tool names from agent md (### tool_name sections)
    const toolNameRegex = /^### (\w+)$/gm;
    const agentToolNames: string[] = [];
    let match;
    while ((match = toolNameRegex.exec(agentMd)) !== null) {
      agentToolNames.push(match[1]);
    }

    const frontendToolNames = allFinetuneTools.map(t => t.name);

    for (const name of agentToolNames) {
      expect(frontendToolNames).toContain(name);
    }
  });

  it('every required parameter in agent md exists in frontend tool schema', () => {
    // Parse parameter definitions from agent md
    // Compare with frontend tool.parameters.required
    // This prevents silent failures from mismatched contracts
  });

  it('every frontend tool has autoExecute set', () => {
    for (const tool of allFinetuneTools) {
      expect(tool.autoExecute).toBe(true);
    }
  });
});
```

---

## Running Tests

### Commands

```bash
# Unit + integration tests (Vitest)
npm test                    # Watch mode
npm run test:run            # Single run (CI)
npm run test:ui             # With Vitest UI dashboard

# Run specific test file
npx vitest run src/lib/distri-finetune-tools/steps/get-evaluation-details/handler.test.ts

# Run tests matching pattern
npx vitest run --reporter=verbose stall-detection

# Type-check (always run after changes)
npx tsc --noEmit
```

### E2E Tests (Chrome MCP — Manual)

```bash
# 1. Start services
npm run dev                    # Terminal 1
npm run start:backend          # Terminal 2

# 2. Open Chrome, navigate to localhost:5173
# 3. Set auth: localStorage.setItem('vlora_user_email', 'test@e2e.local')
# 4. Use Claude in Chrome MCP tools to run E2E scenarios
# 5. Document results in docs/issue/e2e-iteration-test-summary.md
```

### Test Coverage Target

| Area | Target | Rationale |
|------|--------|-----------|
| Tool handlers (unit) | 90%+ | Core logic, deterministic, fast to test |
| Stall detection (unit) | 100% | All 10 patterns must be covered |
| Catch-up protocol (unit) | 90%+ | Critical UX path |
| IndexedDB stores (unit) | 80%+ | CRUD + edge cases |
| Inner loop integration | All 4 scenarios | Happy path + stall + user intervention + escalation |
| Outer loop integration | All 3 scenarios | Improving + overfitting + reward hacking |
| E2E scenarios | 8 scenarios | Full browser verification |

---

## Test Checklist (For Any Agent Implementing)

Before marking a phase as complete, run through this checklist:

### Phase 1 Checklist
- [ ] `get_evaluation_details` handler: 5+ unit tests passing
- [ ] `log_iteration` handler: 3+ unit tests passing
- [ ] `get_iteration_history` handler: 3+ unit tests passing
- [ ] IterationState IndexedDB store: CRUD tests passing
- [ ] `reviewedByAgent` flag: default false, set to true tests passing
- [ ] Catch-up protocol: 5 scenarios (completed, failed, pending, running, nothing) tested
- [ ] Tool contract test: new tools match agent md definitions
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run test:run` — all tests green

### Phase 2 Checklist
- [ ] Score classification: healthy/too_easy/too_hard tests passing
- [ ] Weak/strong topic identification tests passing
- [ ] Cross-iteration delta computation tests passing
- [ ] Stall detection: 10 patterns tested
- [ ] `regenerate_topic` step handler: integration test passing
- [ ] `adjust_grader` step handler: integration test passing
- [ ] Inner loop integration: eval → analyze → propose → apply test passing
- [ ] Agent md updated and backend restarted
- [ ] E2E Scenario 1 (full inner loop) verified in browser
- [ ] E2E Scenario 2 (user intervention) verified in browser

### Phase 3 Checklist
- [ ] Post-training epoch analysis: 3+ unit tests passing
- [ ] Overfitting detection tests passing
- [ ] Post-training dry run eval comparison tests passing
- [ ] Outer loop integration test passing
- [ ] E2E Scenario 8 (outer loop) verified in browser

### Phase 4 Checklist
- [x] `check_viability` handler: 14 unit tests (input validation, classification, boundaries, errors)
- [x] `computeStallCount` helper: 10 unit tests (edge cases, boundary conditions, fixture scenarios)
- [x] `LucyAnalyzeEvalRenderer`: 11 component tests (all eval scenarios + loading/error/fallback)
- [x] `LucyAnalyzeTrainingRenderer`: 11 component tests (all training scenarios + loading/error/fallback)
- [ ] Notification badge appears/disappears correctly (E2E)
- [ ] Progressive background transition timing correct (E2E)
- [ ] Session resumption scenarios 4-6 verified (E2E)
- [ ] Viability pre-check renders verdict in chat (E2E)
- [ ] Stall warning badge appears on PlanCard after 2+ stalls (E2E)
- [ ] Eval analysis card renders structured data (not raw JSON) (E2E)
- [ ] Training analysis card renders epoch progression (E2E)

### E2E Test Scenarios for Phase 4 Features

Use `/finetune-e2e` to run these manually with Chrome MCP:

#### E2E: Viability Pre-Check
```
1. Navigate to dataset with configured grader (step >= grader_config)
2. In Lucy chat: "Check if this task is viable"
3. VERIFY: Lucy runs check_viability tool
4. VERIFY: Result shows verdict (viable/marginal/not_viable)
5. VERIFY: Result includes recommendation text
6. VERIFY: Result includes per-record scores
```

#### E2E: Eval Analysis Card
```
1. Navigate to dataset with completed evaluation
2. In Lucy chat: "Analyze the evaluation results"
3. VERIFY: Structured EvalCheckpointCard renders (not raw JSON)
4. VERIFY: Health badge shows correct status (Healthy/Warning/Critical)
5. VERIFY: Per-topic breakdown visible with colored dots
6. VERIFY: Next action badge visible (Iterate/Ready to Train/Escalate)
```

#### E2E: Training Analysis Card
```
1. Navigate to dataset with completed training job
2. In Lucy chat: "Analyze the training results"
3. VERIFY: Structured TrainingCheckpointCard renders
4. VERIFY: Epoch progression shown (first → last)
5. VERIFY: Pattern badges visible (Improving/Overfitting/No Learning)
6. VERIFY: Next action badge visible
```

#### E2E: Stall Warning on PlanCard
```
1. Create dataset with 3+ iteration history entries (all with |delta| < 0.03)
2. Navigate to dataset, trigger plan proposal
3. VERIFY: Amber stall warning appears on PlanCard ("2 stalled iterations")
4. Add 2 more stalled iterations
5. VERIFY: Red warning appears ("Stalled 5 iterations — consider changing approach")
```
