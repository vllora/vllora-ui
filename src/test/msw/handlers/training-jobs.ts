/**
 * MSW Handler: /finetune/workflows/:workflowId/jobs
 *
 * Handles training job creation, status polling, and listing.
 * Uses workflow-scoped paths and stateful poll counters for
 * deterministic polling transitions.
 */

import { http, HttpResponse, delay } from 'msw';
import { getScenario, incrementTrainingPoll } from '../scenarios/scenario-registry';
import {
  makeCreateTrainingResponse,
  makeCompletedTrainingResponse,
  makeFailedTrainingResponse,
  resolveTrainingPollResponse,
  makeFinetuneMetricsResponse,
} from '../scenarios/training-scenario-bridge';

const BASE = 'http://localhost:8080';

export const trainingJobHandlers = [
  // POST /finetune/workflows/:workflowId/jobs — Create training job
  http.post(`${BASE}/finetune/workflows/:workflowId/jobs`, async () => {
    const scenario = getScenario();
    await delay(scenario.createDelayMs);

    if (scenario.trainingCreateBehavior === 'error') {
      return HttpResponse.json(
        { error: 'Failed to create training job: insufficient credits' },
        { status: 402 },
      );
    }

    return HttpResponse.json(makeCreateTrainingResponse());
  }),

  // GET /finetune/workflows/:workflowId/jobs/:jobId/status — Poll training status
  http.get(`${BASE}/finetune/workflows/:workflowId/jobs/:jobId/status`, async ({ params }) => {
    const jobId = params.jobId as string;
    const scenario = getScenario();
    await delay(scenario.pollDelayMs);

    const pollCount = incrementTrainingPoll(jobId);
    return HttpResponse.json(
      resolveTrainingPollResponse(jobId, scenario.trainingScenario, pollCount, scenario.trainingPollsBeforeComplete),
    );
  }),

  // GET /finetune/workflows/:workflowId/jobs/:jobId/metrics — Training metrics
  http.get(`${BASE}/finetune/workflows/:workflowId/jobs/:jobId/metrics`, async ({ params }) => {
    const jobId = params.jobId as string;
    const scenario = getScenario();
    await delay(scenario.pollDelayMs);

    return HttpResponse.json(makeFinetuneMetricsResponse(jobId, scenario.trainingScenario));
  }),

  // GET /finetune/workflows/:workflowId/jobs — List training jobs
  http.get(`${BASE}/finetune/workflows/:workflowId/jobs`, async () => {
    const scenario = getScenario();
    await delay(scenario.pollDelayMs);

    if (scenario.trainingScenario === 'error') {
      return HttpResponse.json([makeFailedTrainingResponse()]);
    }

    return HttpResponse.json([makeCompletedTrainingResponse()]);
  }),
];
