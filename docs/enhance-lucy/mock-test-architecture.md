# Mock Test Architecture

How we mock the vLLora finetune API for testing — what we mock, what we don't, and why.

---

## What We Mock (and What We Don't)

Lucy's system spans **3 servers** and a **browser**. Understanding which parts are mocked is critical:

```
┌────────────────────────────────────────────────────────────────────────┐
│                         BROWSER (localhost:5173)                       │
│                                                                        │
│  React UI ─── IndexedDB (local persistence) ──── Event Emitters       │
│      │                                                                 │
│      ├─── Tool Handlers (53 tools, execute locally in browser)         │
│      │        │                                                        │
│      │        ├── fetch() ──→ vLLora Gateway (finetune endpoints)      │
│      │        └── some tools call LLM via Distri                       │
│      │                                                                 │
│      └─── @distri/react (useChat) ──→ WebSocket/A2A to Distri Server  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
                    │                              │
         ┌──────────▼───────────┐      ┌───────────▼───────────┐
         │  vLLora Gateway      │      │  Distri Server        │
         │  (port 9090)         │      │  (port 8081)          │
         │                      │      │                       │
         │  /finetune/datasets  │      │  WebSocket/A2A        │
         │  /finetune/evals     │      │  Agent orchestrator   │
         │  /finetune/jobs      │      │  LLM inference        │
         │  /finetune/analytics │      │  Tool routing         │
         │                      │      │                       │
         │  ✅ WE MOCK THIS     │      │  ❌ NOT MOCKED        │
         └──────────────────────┘      └───────────────────────┘
```

### What is mocked

| Component | Why we mock it |
|-----------|---------------|
| **vLLora Gateway `/finetune/*` endpoints** | Eval jobs take 10-30+ min, training takes hours. Mocking returns instant results with controlled scenarios (healthy/warning/critical/stalled/error/overfitting) |

### What is NOT mocked

| Component | Why it's not mocked | When you need it |
|-----------|-------------------|------------------|
| **IndexedDB** | Local, fast, no external dependency. We use real IndexedDB (`fake-indexeddb` in Node.js tests) | Always available — no server needed |
| **Tool handlers** (53 tools) | These ARE the logic being tested. Mocking them would defeat the purpose | Always available — they run in-process |
| **Event emitters** | Real `CustomEvent` API, no external dependency | Always available |
| **Distri Server** (WebSocket/A2A) | Handles Lucy's chat, agent orchestration, LLM inference. Our tests **bypass this entirely** by calling tool handlers directly | Only needed for full Lucy chat E2E |
| **vLLora Gateway non-finetune routes** | We only mock `/finetune/*` and `/api/env` | Needed if testing non-finetune features |

### Why MSW tests bypass the Distri Server

For **Approach 1 (MSW integration tests)**, we bypass the Distri server and call tool handlers directly. This tests tool handler logic (scoring, thresholds, recommendations) in isolation:

```
Test calls tool handler directly → Tool makes HTTP to vLLora (MSW intercepts) → Test asserts result
```

But tool handler logic is only half the picture. **Agent orchestration** — Lucy deciding which tools to call, in what order, and how she responds to results — is equally important and can only be tested with the full stack.

### Why Approach 3 (Proxy Mode) exists

For **full E2E testing**, we need to test the complete agent orchestration:

```
User message → Distri Server → LLM decides tool → A2A sends tool call → Browser executes tool handler → Tool makes HTTP to mock server (instant) → Result back to LLM → LLM decides next action
```

This tests what MSW tests cannot:
- Does Lucy call the right tools in the right order?
- Does Lucy react correctly to healthy/warning/critical eval results?
- Does Lucy escalate when training shows overfitting?
- Does the full UI flow work end-to-end (plan → execute → analyze → iterate)?

We mock only the finetune HTTP boundary (because real eval/training takes hours), keeping everything else real: real LLM, real agent orchestration, real tool execution, real UI rendering.

---

## Is This the Right Approach?

### Industry Validation

Our architecture aligns with established testing patterns:

| Principle | Source | How we follow it |
|-----------|--------|-----------------|
| **"Mock the boundaries, run everything inside"** | [Mocking external systems in E2E tests](https://madewithlove.com/blog/mocking-external-systems-in-e2e-tests/) | We mock the vLLora HTTP boundary; everything else (IndexedDB, tool logic, event system) runs real |
| **Testing Trophy: integration tests give the most confidence** | [Kent C. Dodds](https://kentcdodds.com/blog/static-vs-unit-vs-integration-vs-e2e-tests) | Our MSW integration tests (tool handler chains) are the highest-value layer |
| **Single source of truth for mocks** | [MSW best practices](https://mswjs.io/docs/) | Shared scenario registry + response bridges used by both MSW and Express server |
| **Mock tool execution, not agent reasoning** | [LangWatch](https://langwatch.ai/scenario/testing-guides/mocks/) | We test real tool handlers with mocked HTTP, not mocking the LLM |
| **Playwright: mock at network level, not at code level** | [Playwright mock APIs](https://playwright.dev/docs/mock) | Express mock server provides real HTTP responses |

### Why not just mock `finetune-api.ts` functions in the frontend?

We considered three approaches:

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **A. Mock `finetune-api.ts` (vi.mock)** | Simplest, no server needed | Skips HTTP serialization, doesn't catch API contract mismatches, can't reuse for Playwright | Used for **unit tests only** |
| **B. MSW (in-process HTTP interception)** | Tests real HTTP calls, fast, reusable scenarios | Can't mock WebSocket (Distri) | Used for **integration tests** (primary value) |
| **C. Express mock server** | Real HTTP server for Playwright, runtime scenario switching | Extra process to manage | Used for **browser E2E** |

**We use all three**, each at the right level. This is the "[Testing Trophy](https://kentcdodds.com/blog/static-vs-unit-vs-integration-vs-e2e-tests)" approach — integration tests (B) provide the most confidence per effort.

### What each approach CAN and CAN'T test

| What | MSW (Approach 1) | Mock Express (Approach 2) | Proxy Mode (Approach 3) |
|------|:-:|:-:|:-:|
| Tool handler logic (scoring, thresholds) | Yes | - | Yes |
| UI component rendering | - | Yes | Yes |
| Lucy deciding which tool to call | - | - | Yes |
| Lucy reacting to eval/training results | - | - | Yes |
| Agent md prompt effectiveness | - | - | Yes |
| A2A transport reliability | - | - | Yes |
| Cross-model evaluation differences | - | - | No (needs real eval jobs) |
| Real eval/training timing | - | - | No (mocked to be instant) |

**Key**: Approach 3 (proxy mode) is the only way to test **agent orchestration** — Lucy's decision-making across the full pipeline. MSW tests cover tool logic; proxy mode covers the agent's brain.

### Future option: MSW WebSocket mocking

MSW now supports [WebSocket mocking](https://mswjs.io/docs/websocket/) via `ws.link()`. If we ever need to mock the Distri A2A connection (e.g., to test Lucy's chat UI without a real Distri server), this is possible. Not needed today because our integration tests bypass the WebSocket layer entirely.

---

## Server Requirements by Test Type

| Test Type | Frontend (5173) | Mock Server (9090) | Distri Server (8081) | vLLora Gateway (9090) | LLM Provider |
|-----------|:-:|:-:|:-:|:-:|:-:|
| **Vitest unit tests** | - | - | - | - | - |
| **MSW integration tests** | - | - (MSW intercepts) | - | - | - |
| **Browser dev with MSW** (`pnpm dev:msw`) | Yes | - (MSW in browser) | - | - | - |
| **Browser dev with mock server** | Yes | Yes | - | - | - |
| **Playwright E2E (mock)** | Yes | Yes | - | - | - |
| **Full Lucy chat E2E** | Yes | - | Yes | Yes | Yes |
| **Full Lucy chat + mock finetune** | Yes | Yes (port 9091, `--proxy-to 9090`) | Yes | Yes (proxy target) | Yes |

**Key takeaway**: MSW integration tests and Playwright with mock server need **ZERO backend servers**. Full Lucy chat + mock finetune needs all servers, but finetune results are instant.

---

## Overview

Two mock approaches share the same scenario infrastructure:

| Approach | Use Case | How It Works | Servers Needed |
|----------|----------|-------------|---------------|
| **MSW (Vitest)** | Integration tests | In-process HTTP interception — no server | None |
| **Mock Express Server** | Playwright/Chrome E2E | Standalone HTTP server on port 9090 | Mock server only |

Both read from the same **scenario registry** and **response bridges**.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Shared Infrastructure                     │
│                                                             │
│  src/test/msw/scenarios/                                    │
│  ├── scenario-registry.ts    ← Mutable state singleton      │
│  ├── eval-scenario-bridge.ts ← Eval fixtures → HTTP shapes  │
│  └── training-scenario-bridge.ts ← Training → HTTP shapes   │
│                                                             │
└──────────────┬──────────────────────────┬───────────────────┘
               │                          │
    ┌──────────▼──────────┐   ┌───────────▼──────────────┐
    │   MSW (Vitest)      │   │   Express Mock Server    │
    │                     │   │                          │
    │  src/test/msw/      │   │  src/test/mock-server/   │
    │  ├── server.ts      │   │  └── server.ts           │
    │  ├── setup.ts       │   │                          │
    │  ├── browser.ts     │   │  Runs on port 9090       │
    │  └── handlers/      │   │  Control API: /mock/*    │
    │      ├── env.ts     │   │                          │
    │      ├── datasets.ts│   │  Start:                  │
    │      ├── evaluations│   │  pnpm mock-server        │
    │      ├── training-* │   │                          │
    │      ├── finetune-* │   │  Switch scenario:        │
    │      └── analytics  │   │  curl POST /mock/scenario│
    │                     │   │                          │
    │  Used by:           │   │  Used by:                │
    │  npx vitest run     │   │  Playwright, Chrome MCP  │
    │  pnpm dev:msw       │   │  Manual browser testing  │
    └─────────────────────┘   └──────────────────────────┘
```

**What this diagram does NOT show**: The Distri server (WebSocket/A2A for Lucy chat) and LLM providers. These are **not part of the mock infrastructure** — they are only needed for full-stack testing with a live Lucy agent.

---

## Mocked Endpoints (Finetune API Only)

These are the **only** endpoints we mock. All are from `src/services/finetune-api.ts`:

| Method | Endpoint | What it does | Why we mock it |
|--------|----------|-------------|---------------|
| GET | `/api/env` | Returns port config | Configures API base URL |
| POST | `/finetune/datasets` | Upload JSONL dataset | Real upload goes to OpenAI |
| PATCH | `/finetune/datasets/:id/evaluator` | Set grader script | Real call updates remote dataset |
| POST | `/finetune/evaluations` | Start eval job | Real job takes 10-30+ min |
| GET | `/finetune/evaluations/:id` | Poll eval status | Real polling waits for remote job |
| POST | `/finetune/reinforcement-jobs` | Start training job | Real job takes hours |
| GET | `/finetune/reinforcement-jobs/:id/status` | Poll training status | Real polling waits for remote job |
| GET | `/finetune/reinforcement-jobs` | List training jobs | Depends on real backend state |
| GET | `/finetune/datasets/:id/finetune-evaluations` | Get per-epoch training scores | Depends on real training job |
| POST | `/finetune/datasets/analytics/dry-run` | Dataset analytics | Optional, fast |
| POST | `/finetune/reinforcement-jobs/:id/cancel` | Cancel training | Side effect on real job |
| POST | `/finetune/reinforcement-jobs/:id/resume` | Resume training | Side effect on real job |
| GET | `/finetune/reinforcement-jobs/:id/weights/url` | Get model download URL | Depends on real trained model |

**Everything else** (Distri WebSocket, LLM calls, non-finetune routes) is **NOT mocked** and requires real servers if needed.

---

## Scenario Registry

The central state singleton that both MSW handlers and Express routes read from.

**File**: `src/test/msw/scenarios/scenario-registry.ts`

### State Shape

```typescript
interface ScenarioState {
  evalScenario: 'healthy' | 'warning' | 'critical' | 'stalled' | 'error';
  trainingScenario: 'improving' | 'overfitting' | 'noLearning' | 'error';
  evalPollsBeforeComplete: number;        // 0 = instant, N = poll N times first
  trainingPollsBeforeComplete: number;
  createDelayMs: number;                  // Delay on create endpoints (default 50ms)
  pollDelayMs: number;                    // Delay on poll endpoints (default 50ms)
  uploadBehavior: 'success' | 'error' | 'timeout';
  evalCreateBehavior: 'success' | 'error' | 'timeout';
  trainingCreateBehavior: 'success' | 'error' | 'timeout';
}
```

### API

```typescript
import { getScenario, setScenario, resetScenario } from '../msw/scenarios/scenario-registry';

// Read current state (handlers call this on every request)
const scenario = getScenario();

// Set state (tests call this before making requests)
setScenario({ evalScenario: 'warning', evalPollsBeforeComplete: 3 });

// Reset to defaults + clear poll counters (afterEach in tests)
resetScenario();

// Poll counters — track how many times each resource has been polled
import { incrementEvalPoll, incrementTrainingPoll } from '../msw/scenarios/scenario-registry';
const pollCount = incrementEvalPoll('eval-run-001');  // returns 1, 2, 3, ...
const trainPoll = incrementTrainingPoll('ft-job-001');
```

### Scenario Descriptions

| Eval Scenario | Mean Score | Characteristics | `next_action` |
|---------------|-----------|-----------------|---------------|
| `healthy` | ~0.65 | All topics passing, good variance | `train` |
| `warning` | ~0.42 | Mixed topics, some failing | `iterate` |
| `critical` | ~0.18 | Binary 0/1 scores, grader issues | `escalate` |
| `stalled` | ~0.45 | Flat scores, no improvement | `escalate` |
| `error` | 0 | No results, job failed | error response |

| Training Scenario | Epochs | Characteristics | `next_action` |
|-------------------|--------|-----------------|---------------|
| `improving` | 3 | Scores increase each epoch | `deploy_eval` |
| `overfitting` | 4 | Scores rise then fall | `investigate` |
| `noLearning` | 3 | Flat scores across epochs | `inner_loop` |
| `error` | 0 | Job failed | `retrain` |

---

## Response Bridges

Convert scenario keys into raw HTTP response shapes (what `finetune-api.ts` returns).

### Eval Bridge (`src/test/msw/scenarios/eval-scenario-bridge.ts`)

```typescript
makeUploadResponse(datasetId?)      // → { dataset_id: string }
makeCreateEvalResponse(totalRows?)  // → { evaluation_run_id, status: 'running', total_rows }
makeRunningEvalResponse(runId, completedRows, totalRows)  // → partial progress
makeCompletedEvalResponse(scenario, runId?, totalRows?)   // → full results with scores
makeFailedEvalResponse(runId?)      // → { status: 'failed' }
```

### Training Bridge (`src/test/msw/scenarios/training-scenario-bridge.ts`)

```typescript
makeCreateTrainingResponse(jobId?)    // → FinetuneJob with status: 'pending'
makeRunningTrainingResponse(jobId?)   // → status: 'running'
makeCompletedTrainingResponse(jobId?) // → status: 'succeeded', fine_tuned_model set
makeFailedTrainingResponse(jobId?)    // → status: 'failed'
makeFinetuneEvalResponse(scenario)    // → per-epoch, per-row training eval scores
```

---

## Approach 1: MSW (Vitest Integration Tests)

**Purpose**: Fast in-process tests that call tool handlers directly with real IndexedDB + mocked HTTP.

**Servers needed**: None. Everything runs in-process.

### How It Works

```
Test → calls analyzeTrainingHandler({ dataset_id, job_id })
         ↓
Handler calls fetch('http://localhost:8080/finetune/reinforcement-jobs/...')
         ↓
MSW intercepts the request (in-process, no real HTTP)
         ↓
MSW handler reads getScenario() → returns appropriate response
         ↓
Handler processes response → returns analysis result
         ↓
Test asserts: result.next_action === 'deploy_eval'
```

**Note**: The Distri server is completely bypassed. Tests call tool handlers directly — no WebSocket, no A2A protocol, no LLM. This tests the tool's **decision logic** (scoring, thresholds, recommendations) not the agent's orchestration.

### Files

```
src/test/msw/
├── server.ts           # setupServer() for Vitest (Node.js)
├── browser.ts          # setupWorker() for dev E2E (browser, VITE_MSW_ENABLED)
├── setup.ts            # Vitest lifecycle hooks (beforeAll/afterEach/afterAll)
├── scenarios/          # Shared with Express mock server
│   ├── scenario-registry.ts
│   ├── eval-scenario-bridge.ts
│   └── training-scenario-bridge.ts
└── handlers/
    ├── index.ts        # Combines all handler arrays
    ├── env.ts          # GET /api/env
    ├── datasets.ts     # POST /finetune/datasets, PATCH .../evaluator
    ├── evaluations.ts  # POST/GET /finetune/evaluations (stateful polling)
    ├── training-jobs.ts         # POST/GET /finetune/reinforcement-jobs
    ├── finetune-evaluations.ts  # GET .../finetune-evaluations
    └── analytics.ts    # POST .../analytics/dry-run
```

### Integration Tests

```
src/test/integration/
├── seed-helpers.ts              # IndexedDB seeding (seedDataset, seedRecords, etc.)
├── eval-analysis.test.ts        # 7 tests — analyze_evaluation scenarios
└── training-analysis.test.ts    # 8 tests — analyze_training scenarios
```

### Writing a New Integration Test

```typescript
import { describe, it, expect } from 'vitest';
import { analyzeTrainingHandler } from '@/lib/distri-finetune-tools/steps/analyze-training';
import { seedDataset, seedRecords, seedWorkflow } from './seed-helpers';
import { setScenario } from '../msw/scenarios/scenario-registry';

describe('my new scenario', () => {
  it('does the thing', async () => {
    // 1. Seed IndexedDB
    const datasetId = await seedDataset({ backendDatasetId: 'ds-backend-001' });
    await seedRecords(datasetId, [{ id: 'row-0', topic: 'Pins' }]);
    await seedWorkflow(datasetId, { jobId: 'ft-job-001' });

    // 2. Set MSW scenario
    setScenario({ trainingScenario: 'overfitting', trainingPollsBeforeComplete: 0 });

    // 3. Call tool handler
    const result = await analyzeTrainingHandler({ dataset_id: datasetId, job_id: 'ft-job-001' });

    // 4. Assert
    expect(result.success).toBe(true);
    expect(result.next_action).toBe('investigate');
  });
});
```

### Running

```bash
npx vitest run                              # All tests (64 total)
npx vitest run src/test/integration/        # Integration tests only
pnpm dev:msw                                # Dev server with MSW (browser)
```

---

## Approach 2: Mock Express Server (Playwright/Chrome E2E)

**Purpose**: Standalone HTTP server that replaces the real vLLora gateway for browser-based E2E testing.

**Servers needed**: Mock server only. No Distri, no real vLLora gateway.

**What you can test**: UI rendering, component behavior, user flows (clicking, navigating, viewing eval/training results). Anything that doesn't require Lucy's agent chat.

**What you can't test**: Lucy's conversational flow (requires Distri server for WebSocket/A2A).

### How It Works

```
Playwright/Chrome MCP
       ↓ interacts with
React UI (localhost:5173)
       ↓ fetch()
Mock Express Server (localhost:9090)    ← replaces vLLora gateway
       ↓ reads
Scenario Registry (same module as MSW)
       ↓ builds
Response Bridges → JSON response

NOT involved:
  ✗ Distri Server (no WebSocket/A2A)
  ✗ LLM Provider (no inference)
  ✗ Real vLLora Gateway
```

### File

```
src/test/mock-server/
└── server.ts    # Express server importing from ../msw/scenarios/
```

### Starting

```bash
pnpm mock-server                                         # Port 9090 (default)
pnpm mock-server:9090                                    # Explicit port
npx tsx src/test/mock-server/server.ts --port 8080       # Custom port
```

### Control API

Switch scenarios at runtime via HTTP — no restart needed:

```bash
# Set scenario
curl -X POST http://localhost:9090/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"warning","trainingScenario":"overfitting"}'

# Get current scenario
curl http://localhost:9090/mock/scenario

# Reset everything (scenarios + tracked datasets + poll counters)
curl -X POST http://localhost:9090/mock/reset

# List datasets created through the mock
curl http://localhost:9090/mock/datasets
```

### Dataset ID Tracking

The mock server generates **deterministic IDs** that are distinguishable from real backend IDs:

| Source | ID Pattern | Example |
|--------|-----------|---------|
| Mock server (auto) | `mock-ds-NNN` | `mock-ds-001`, `mock-ds-002` |
| Mock server (custom) | Any string | `my-test-dataset` |
| Real backend | UUID or `ds-*` | `ds-a1b2c3d4` |

Set a custom dataset ID:
```bash
curl -X POST http://localhost:9090/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"mockDatasetId":"my-test-dataset"}'
```

This prevents polling conflicts when switching between mock and real API — you can tell at a glance which datasets came from the mock.

### E2E Testing Workflow

```bash
# Terminal 1: Start mock gateway (replaces vLLora gateway finetune endpoints)
pnpm mock-server

# Terminal 2: Start frontend
pnpm dev

# Terminal 3: Run Playwright or use Chrome MCP
# The UI will make real HTTP calls to localhost:9090 (mock server)
# Lucy chat will NOT work (no Distri server) — but dataset views,
# eval results, training progress UI all work fine.

# Switch scenarios mid-test:
curl -X POST http://localhost:9090/mock/scenario \
  -d '{"evalScenario":"critical","evalPollsBeforeComplete":2}'
```

---

## Approach 3: Full Lucy Chat + Mock Finetune (Proxy Mode)

**Purpose**: Test Lucy's full conversational flow with real LLM + real Distri, but with finetune API responses mocked so eval/training scenarios complete instantly.

**Servers needed**: Real vLLora gateway (9090) + Distri server (8081) + Mock server in proxy mode (9091) + Frontend (5173) + LLM provider.

**What you can test**: The complete Lucy experience — Lucy decides what to do, calls tools, eval/training complete instantly with controlled scenarios, you see the full UI flow.

### Architecture

```
Frontend (localhost:5173)
    │
    ├── Finetune API calls ──→ Mock Server (9091) ──→ instant mock responses
    │                              │
    │                              └── Non-finetune calls ──→ proxy to Real Gateway (9090)
    │
    └── Lucy A2A chat ──→ Distri Server (8081) ──→ real LLM + agent orchestration
```

The mock server at port 9091 has `--proxy-to 9090`:
- **`/finetune/*` and `/mock/*` requests** → handled locally with mocked responses (instant)
- **Everything else** → proxied to the real vLLora gateway at port 9090

The frontend is configured with `VITE_BACKEND_PORT=9091` so all API calls go through the mock server.

### Setup (3 terminals)

```bash
# Terminal 1: Real backend (Distri at 8081 + vLLora gateway at 9090)
./scripts/restart-backend.sh

# Terminal 2: Mock server in proxy mode (intercepts finetune, proxies rest)
pnpm mock-server:lucy

# Terminal 3: Frontend pointing to mock server
VITE_BACKEND_PORT=9091 pnpm dev
```

### Testing Workflow

1. Start all 3 terminals (order matters — backend first, then mock server, then frontend)
2. Open browser at `localhost:5173`
3. Set the desired scenario via control API:
   ```bash
   curl -X POST http://localhost:9091/mock/scenario \
     -H "Content-Type: application/json" \
     -d '{"evalScenario":"healthy","trainingScenario":"improving"}'
   ```
4. Chat with Lucy — ask her to run an evaluation or start training
5. Lucy calls the real LLM → decides tool → tool makes HTTP to `localhost:9091` → mock server returns instant results
6. Verify the UI shows correct results, iteration checkpoints, stall warnings, etc.
7. Switch scenario mid-conversation to test Lucy's reaction:
   ```bash
   curl -X POST http://localhost:9091/mock/scenario \
     -d '{"evalScenario":"critical","trainingScenario":"overfitting"}'
   ```

### What Makes This Different from Approach 2

| | Approach 2 (Mock Express) | Approach 3 (Proxy Mode) |
|---|---|---|
| Lucy chat | Not available (no Distri) | Full conversational flow |
| LLM decisions | N/A | Real LLM decides tools |
| Finetune API | Mocked | Mocked (same responses) |
| Non-finetune API | Not available | Proxied to real gateway |
| Setup complexity | 2 terminals | 3 terminals |
| Use case | UI component testing | Full E2E with Lucy |

---

## When to Use Which

| Situation | Approach | Servers Needed |
|-----------|---------|----------------|
| Testing tool handler decision logic | MSW integration test | None |
| Testing tool handler chains (eval → analyze → iterate) | MSW integration test | None |
| Verifying UI renders correct finetune components | Playwright + Mock Express | Mock server + frontend |
| Verifying finetune user flows (click, navigate, view results) | Playwright + Mock Express | Mock server + frontend |
| Quick dev iteration with scenario switching | `pnpm dev:msw` (browser MSW) | Frontend only |
| Testing Lucy's full conversational flow | Full stack | Distri + vLLora + LLM + frontend |
| Testing Lucy + mock finetune results | Proxy mode (`pnpm mock-server:lucy`) | Distri + vLLora + mock server (9091) + LLM + frontend |

---

## Adding a New Scenario

1. Add the scenario key to `ScenarioState` in `scenario-registry.ts`
2. Add response data to the appropriate bridge file (`eval-scenario-bridge.ts` or `training-scenario-bridge.ts`)
3. Handle the new scenario in the MSW handler (in `src/test/msw/handlers/`)
4. The Express mock server automatically picks it up (it imports from the same bridges)
5. Write integration tests using `setScenario({ yourNewScenario: 'value' })`

---

## File Reference

```
src/test/
├── setup.ts                          # Vitest global setup
├── fixtures/                         # Typed test data
│   ├── eval-scenarios.ts             # EVAL_SCENARIOS, ITERATION_HISTORIES
│   └── training-scenarios.ts         # TRAINING_SCENARIOS
├── mocks/
│   └── finetune-api.mock.ts          # vi.mock() factory (unit tests only)
├── msw/                              # MSW infrastructure (shared scenarios)
│   ├── server.ts                     # setupServer() for Vitest
│   ├── browser.ts                    # setupWorker() for dev E2E
│   ├── setup.ts                      # Vitest lifecycle hooks
│   ├── scenarios/                    # *** SHARED by MSW + Express ***
│   │   ├── scenario-registry.ts      # Mutable state + poll counters
│   │   ├── eval-scenario-bridge.ts   # Eval scenario → HTTP responses
│   │   └── training-scenario-bridge.ts
│   └── handlers/                     # MSW request handlers
│       ├── index.ts
│       ├── env.ts
│       ├── datasets.ts
│       ├── evaluations.ts
│       ├── training-jobs.ts
│       ├── finetune-evaluations.ts
│       └── analytics.ts
├── integration/                      # Tool handler chain tests
│   ├── seed-helpers.ts               # IndexedDB seeding
│   ├── eval-analysis.test.ts         # 7 tests
│   └── training-analysis.test.ts     # 8 tests
└── mock-server/                      # Standalone Express mock
    └── server.ts                     # Imports from ../msw/scenarios/
```
