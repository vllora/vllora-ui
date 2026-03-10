/**
 * Mock Express Server for Playwright/Chrome E2E Testing
 *
 * Standalone HTTP server that replaces the real vLLora gateway.
 * Reuses the same scenario registry and response bridges as MSW
 * so every Lucy scenario can be tested via the browser.
 *
 * Usage:
 *   npx tsx src/test/mock-server/server.ts [--port 9090]
 *   npx tsx src/test/mock-server/server.ts [--port 9091] [--proxy-to 9090]
 *
 * Proxy Mode (--proxy-to):
 *   When --proxy-to is set, the mock server intercepts /finetune/* and /mock/*
 *   endpoints with mocked responses, and proxies everything else to the real
 *   vLLora gateway. This enables full Lucy chat testing with instant finetune
 *   results — Lucy talks to the real Distri server (8081) for AI chat, while
 *   finetune API calls complete instantly via mock responses.
 *
 * Control API (set scenarios at runtime):
 *   POST /mock/scenario      — Set scenario state (+ optional mockDatasetId)
 *   GET  /mock/scenario      — Get current scenario state
 *   POST /mock/reset         — Reset to defaults (clears all tracked data)
 *   GET  /mock/datasets      — List tracked mock dataset IDs
 *
 * Dataset ID Tracking:
 *   The mock server generates deterministic dataset IDs (mock-ds-001, ...)
 *   so they're distinguishable from real backend IDs. When switching to the
 *   real API, these IDs won't collide. Set a custom ID via:
 *     POST /mock/scenario { mockDatasetId: "custom-id" }
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';

import {
  getScenario,
  setScenario,
  resetScenario,
  incrementEvalPoll,
  incrementTrainingPoll,
  getTrainingPollCount,
} from '../msw/scenarios/scenario-registry';
import {
  makeCreateEvalResponse,
  resolveEvalPollResponse,
  makeEvaluatorVersionsResponse,
} from '../msw/scenarios/eval-scenario-bridge';
import {
  makeCreateTrainingResponse,
  makeCompletedTrainingResponse,
  makeFailedTrainingResponse,
  makeFinetuneEvalResponse,
  resolveTrainingPollResponse,
  makeReinforcementMetricsResponse,
} from '../msw/scenarios/training-scenario-bridge';

// =============================================================================
// Config
// =============================================================================

const DEFAULT_PORT = 9090;
const port = parsePort();
const proxyTarget = parseProxyPort();

function parsePort(): number {
  const idx = process.argv.indexOf('--port');
  if (idx !== -1 && process.argv[idx + 1]) {
    const parsed = parseInt(process.argv[idx + 1], 10);
    if (!isNaN(parsed)) return parsed;
  }
  return DEFAULT_PORT;
}

function parseProxyPort(): number | null {
  const idx = process.argv.indexOf('--proxy-to');
  if (idx !== -1 && process.argv[idx + 1]) {
    const parsed = parseInt(process.argv[idx + 1], 10);
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

// =============================================================================
// Mock Data Registry
// =============================================================================

interface MockDatasetEntry {
  readonly datasetId: string;
  readonly createdAt: string;
  readonly evalRunIds: string[];
  readonly trainingJobIds: string[];
  /** Row IDs parsed from uploaded JSONL — used for realistic eval responses. */
  rowIds: string[];
}

/** All datasets created through the mock server, keyed by backend dataset ID. */
const mockDatasets = new Map<string, MockDatasetEntry>();

/** Tracked training jobs — keyed by job ID, value is owning dataset ID (or null). */
const mockTrainingJobs = new Map<string, string | null>();

/** Maps provider_job_id → id so status polls with either ID resolve correctly. */
const providerJobIdMap = new Map<string, string>();

let datasetCounter = 0;
let evalRunCounter = 0;
let trainingJobCounter = 0;
let mockDatasetIdOverride: string | null = null;

function nextDatasetId(): string {
  if (mockDatasetIdOverride) return mockDatasetIdOverride;
  datasetCounter += 1;
  return `mock-ds-${String(datasetCounter).padStart(3, '0')}`;
}

function nextEvalRunId(): string {
  evalRunCounter += 1;
  return `mock-eval-${String(evalRunCounter).padStart(3, '0')}`;
}

function nextTrainingJobId(): string {
  trainingJobCounter += 1;
  return `mock-ft-${String(trainingJobCounter).padStart(3, '0')}`;
}

function registerDataset(datasetId: string, rowIds: string[] = []): MockDatasetEntry {
  const entry: MockDatasetEntry = {
    datasetId,
    createdAt: new Date().toISOString(),
    evalRunIds: [],
    trainingJobIds: [],
    rowIds,
  };
  mockDatasets.set(datasetId, entry);
  return entry;
}

/** Parse row IDs from uploaded JSONL content. */
function parseRowIdsFromJsonl(buffer: Buffer | undefined): string[] {
  if (!buffer) return [];
  try {
    const text = buffer.toString('utf-8');
    return text.split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const parsed = JSON.parse(line);
        return typeof parsed.id === 'string' ? parsed.id : '';
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function resetMockData(): void {
  mockDatasets.clear();
  mockTrainingJobs.clear();
  providerJobIdMap.clear();
  datasetCounter = 0;
  evalRunCounter = 0;
  trainingJobCounter = 0;
  mockDatasetIdOverride = null;
}

/** Resolve a jobId from the URL — may be either `id` or `provider_job_id`. */
function resolveJobId(rawJobId: string): string {
  return providerJobIdMap.get(rawJobId) ?? rawJobId;
}

// =============================================================================
// App Setup
// =============================================================================

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Control Endpoints
// =============================================================================

app.post('/mock/scenario', (req, res) => {
  const { mockDatasetId, ...scenarioFields } = req.body ?? {};
  if (mockDatasetId && typeof mockDatasetId === 'string') {
    mockDatasetIdOverride = mockDatasetId;
  }
  setScenario(scenarioFields);
  res.json({ ok: true, scenario: getScenario(), mockDatasetIdOverride });
});

app.get('/mock/scenario', (_req, res) => {
  res.json({ ...getScenario(), mockDatasetIdOverride });
});

app.post('/mock/reset', (_req, res) => {
  resetScenario();
  resetMockData();
  res.json({ ok: true, scenario: getScenario() });
});

app.get('/mock/datasets', (_req, res) => {
  const datasets = Array.from(mockDatasets.values());
  res.json({ datasets, total: datasets.length });
});

// =============================================================================
// GET /api/env
// =============================================================================

app.get('/api/env', (_req, res) => {
  res.json({
    VITE_BACKEND_PORT: port,
    VITE_OTEL_PORT: 4317,
    VITE_DISTRI_PORT: 8081,
  });
});

// =============================================================================
// POST /finetune/datasets — Upload dataset
// =============================================================================

app.post('/finetune/datasets', upload.single('file'), async (req, res) => {
  const scenario = getScenario();
  await delayMs(scenario.createDelayMs);

  if (scenario.uploadBehavior === 'error') {
    res.status(400).json({ error: 'Upload failed: invalid format' });
    return;
  }

  if (scenario.uploadBehavior === 'timeout') {
    await delayMs(30_000);
    res.status(504).json({ error: 'Request timed out' });
    return;
  }

  // Parse row IDs from uploaded JSONL so eval responses use real IDs
  const rowIds = parseRowIdsFromJsonl(req.file?.buffer);

  const datasetId = nextDatasetId();
  registerDataset(datasetId, rowIds);
  console.log(`[mock] Dataset ${datasetId} uploaded with ${rowIds.length} rows`);
  res.json({ dataset_id: datasetId });
});

// =============================================================================
// GET /finetune/datasets/:datasetId/evaluator/versions
// =============================================================================

app.get('/finetune/datasets/:datasetId/evaluator/versions', async (req, res) => {
  await delayMs(getScenario().pollDelayMs);
  res.json(makeEvaluatorVersionsResponse(req.params.datasetId));
});

// =============================================================================
// PATCH /finetune/datasets/:datasetId/evaluator
// =============================================================================

app.patch('/finetune/datasets/:datasetId/evaluator', async (req, res) => {
  await delayMs(getScenario().createDelayMs);
  res.json({ dataset_id: req.params.datasetId, updated: true });
});

// =============================================================================
// POST /finetune/evaluations — Create evaluation run
// =============================================================================

app.post('/finetune/evaluations', async (req, res) => {
  const scenario = getScenario();
  await delayMs(scenario.createDelayMs);

  if (scenario.evalCreateBehavior === 'error') {
    res.status(404).json({ error: 'Failed to create evaluation: dataset not found' });
    return;
  }

  const evalRunId = nextEvalRunId();
  const datasetId = req.body?.dataset_id as string | undefined;

  // Track the eval run under its dataset if known
  if (datasetId) {
    const entry = mockDatasets.get(datasetId);
    if (entry) entry.evalRunIds.push(evalRunId);
  }

  res.json(makeCreateEvalResponse(10, evalRunId));
});

// =============================================================================
// GET /finetune/evaluations/:id — Poll evaluation status
// =============================================================================

app.get('/finetune/evaluations/:id', async (req, res) => {
  const runId = req.params.id;
  const scenario = getScenario();
  await delayMs(scenario.pollDelayMs);

  // Find the dataset that owns this eval run to get real row IDs
  const ownerDataset = [...mockDatasets.values()].find((d) => d.evalRunIds.includes(runId));
  const rowIds = ownerDataset?.rowIds ?? [];

  const pollCount = incrementEvalPoll(runId);
  res.json(resolveEvalPollResponse(runId, scenario.evalScenario, pollCount, scenario.evalPollsBeforeComplete, rowIds.length || 10, rowIds));
});

// =============================================================================
// POST /finetune/reinforcement-jobs — Create training job
// =============================================================================

app.post('/finetune/reinforcement-jobs', async (req, res) => {
  const scenario = getScenario();
  await delayMs(scenario.createDelayMs);

  if (scenario.trainingCreateBehavior === 'error') {
    res.status(402).json({ error: 'Failed to create training job: insufficient credits' });
    return;
  }

  const jobId = nextTrainingJobId();
  const datasetId = req.body?.dataset as string | undefined;

  // Track the training job under its dataset if known
  if (datasetId) {
    const entry = mockDatasets.get(datasetId);
    if (entry) entry.trainingJobIds.push(jobId);
  }

  // Track job so the list endpoint can return it
  mockTrainingJobs.set(jobId, datasetId ?? null);

  const response = makeCreateTrainingResponse(jobId);

  // Map provider_job_id → id so status polls with either ID resolve correctly
  if (response.provider_job_id && response.provider_job_id !== jobId) {
    providerJobIdMap.set(response.provider_job_id, jobId);
  }

  console.log(`[mock] Training job ${jobId} created (provider: ${response.provider_job_id}) for dataset ${datasetId ?? 'unknown'}`);

  res.json(response);
});

// =============================================================================
// GET /finetune/reinforcement-jobs/:jobId/status — Poll training status
// =============================================================================

app.get('/finetune/reinforcement-jobs/:jobId/status', async (req, res) => {
  const jobId = resolveJobId(req.params.jobId);
  const scenario = getScenario();
  await delayMs(scenario.pollDelayMs);

  const pollCount = incrementTrainingPoll(jobId);
  res.json(resolveTrainingPollResponse(jobId, scenario.trainingScenario, pollCount, scenario.trainingPollsBeforeComplete));
});

// =============================================================================
// GET /finetune/reinforcement-jobs — List training jobs
// =============================================================================

app.get('/finetune/reinforcement-jobs', async (req, res) => {
  const scenario = getScenario();
  await delayMs(scenario.pollDelayMs);

  const datasetIdFilter = req.query.dataset_id as string | undefined;

  // If jobs were created via POST, return them (optionally filtered by dataset)
  if (mockTrainingJobs.size > 0) {
    const jobs = [...mockTrainingJobs.entries()]
      .filter(([, dsId]) => !datasetIdFilter || dsId === datasetIdFilter)
      .map(([jobId]) => resolveTrainingPollResponse(
        jobId,
        scenario.trainingScenario,
        getTrainingPollCount(jobId),
        scenario.trainingPollsBeforeComplete,
      ));
    res.json(jobs);
    return;
  }

  // Fallback: no jobs created yet — return scenario-based default
  if (scenario.trainingScenario === 'error') {
    res.json([makeFailedTrainingResponse()]);
    return;
  }

  res.json([makeCompletedTrainingResponse()]);
});

// =============================================================================
// POST /finetune/reinforcement-jobs/:jobId/cancel
// =============================================================================

app.post('/finetune/reinforcement-jobs/:jobId/cancel', async (_req, res) => {
  await delayMs(getScenario().createDelayMs);
  res.json({ ok: true });
});

// =============================================================================
// POST /finetune/reinforcement-jobs/:jobId/resume
// =============================================================================

app.post('/finetune/reinforcement-jobs/:jobId/resume', async (_req, res) => {
  await delayMs(getScenario().createDelayMs);
  res.json({ ok: true });
});

// =============================================================================
// GET /finetune/reinforcement-jobs/:jobId/metrics — Training metrics
// =============================================================================

app.get('/finetune/reinforcement-jobs/:jobId/metrics', async (req, res) => {
  const jobId = resolveJobId(req.params.jobId);
  const scenario = getScenario();
  await delayMs(scenario.pollDelayMs);
  res.json(makeReinforcementMetricsResponse(jobId, scenario.trainingScenario));
});

// =============================================================================
// GET /finetune/reinforcement-jobs/:jobId/weights/url
// =============================================================================

app.get('/finetune/reinforcement-jobs/:jobId/weights/url', async (_req, res) => {
  await delayMs(getScenario().pollDelayMs);
  res.json({
    download_url: 'https://mock-storage.example.com/weights/model.safetensors',
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
});

// =============================================================================
// GET /finetune/datasets/:datasetId/finetune-evaluations
// =============================================================================

app.get('/finetune/datasets/:datasetId/finetune-evaluations', async (req, res) => {
  const scenario = getScenario();
  await delayMs(scenario.pollDelayMs);
  const entry = mockDatasets.get(req.params.datasetId);
  const rowIds = entry?.rowIds ?? [];
  const rowCount = rowIds.length > 0 ? rowIds.length : scenario.trainingRowCount;
  res.json(makeFinetuneEvalResponse(scenario.trainingScenario, rowCount, rowIds));
});

// =============================================================================
// POST /finetune/datasets/analytics/dry-run
// =============================================================================

app.post('/finetune/datasets/analytics/dry-run', async (_req, res) => {
  await delayMs(getScenario().createDelayMs);
  res.json({
    analytics: {
      total_rows: 150,
      avg_message_length: 250,
      topic_distribution: { Pins: 50, Forks: 50, Combos: 50 },
    },
    quality: {
      format_valid: true,
      has_system_messages: true,
      avg_turns: 3.2,
    },
  });
});

// =============================================================================
// Catch-All Proxy (when --proxy-to is set)
// =============================================================================

if (proxyTarget) {
  // Express 5 requires named wildcard params (path-to-regexp v8)
  app.all('{*path}', async (req, res) => {
    const targetUrl = `http://localhost:${proxyTarget}${req.originalUrl}`;
    try {
      const headers: Record<string, string> = {};
      if (req.headers['content-type']) {
        headers['Content-Type'] = req.headers['content-type'] as string;
      }
      if (req.headers['authorization']) {
        headers['Authorization'] = req.headers['authorization'] as string;
      }

      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
      });

      const contentType = response.headers.get('content-type') ?? 'application/json';
      const data = await response.text();
      res.status(response.status).set('Content-Type', contentType).send(data);
    } catch {
      res.status(502).json({ error: 'Proxy target unreachable', target: targetUrl });
    }
  });
}

// =============================================================================
// Start Server
// =============================================================================

app.listen(port, () => {
  console.log(`\n  Mock vLLora Gateway running on http://localhost:${port}`);

  if (proxyTarget) {
    console.log(`  Proxy mode: non-finetune requests → http://localhost:${proxyTarget}`);
    console.log(`  Finetune endpoints: mocked (instant responses)`);
    console.log(`  Use with: VITE_BACKEND_PORT=${port} pnpm dev`);
  }

  console.log(`  Control API:`);
  console.log(`    POST http://localhost:${port}/mock/scenario  — Set scenario`);
  console.log(`    GET  http://localhost:${port}/mock/scenario  — Get scenario`);
  console.log(`    POST http://localhost:${port}/mock/reset     — Reset to defaults`);
  console.log(`    GET  http://localhost:${port}/mock/datasets  — List mock datasets`);
  console.log(`\n  Default scenario: healthy eval + improving training`);
  console.log(`  Dataset IDs: mock-ds-001, mock-ds-002, ... (or set mockDatasetId)\n`);
});
