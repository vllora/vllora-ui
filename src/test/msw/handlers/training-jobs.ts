/**
 * MSW Handler: /finetune/reinforcement-jobs
 *
 * Handles training job creation, status polling, and listing.
 * Uses stateful poll counters for deterministic polling transitions.
 */

import { http, HttpResponse, delay } from 'msw';
import { getScenario, incrementTrainingPoll } from '../scenarios/scenario-registry';
import {
  makeCreateTrainingResponse,
  makeRunningTrainingResponse,
  makeCompletedTrainingResponse,
  makeFailedTrainingResponse,
} from '../scenarios/training-scenario-bridge';

const BASE = 'http://localhost:8080';

export const trainingJobHandlers = [
  // POST /finetune/reinforcement-jobs — Create training job
  http.post(`${BASE}/finetune/reinforcement-jobs`, async () => {
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

  // GET /finetune/reinforcement-jobs/:jobId/status — Poll training status
  http.get(`${BASE}/finetune/reinforcement-jobs/:jobId/status`, async ({ params }) => {
    const jobId = params.jobId as string;
    const scenario = getScenario();
    await delay(scenario.pollDelayMs);

    const pollCount = incrementTrainingPoll(jobId);

    // Still running — not enough polls yet
    if (pollCount <= scenario.trainingPollsBeforeComplete) {
      return HttpResponse.json(makeRunningTrainingResponse(jobId));
    }

    // Error scenario
    if (scenario.trainingScenario === 'error') {
      return HttpResponse.json(makeFailedTrainingResponse(jobId));
    }

    // Completed
    return HttpResponse.json(makeCompletedTrainingResponse(jobId));
  }),

  // GET /finetune/reinforcement-jobs — List training jobs
  http.get(`${BASE}/finetune/reinforcement-jobs`, async () => {
    const scenario = getScenario();
    await delay(scenario.pollDelayMs);

    if (scenario.trainingScenario === 'error') {
      return HttpResponse.json([makeFailedTrainingResponse()]);
    }

    return HttpResponse.json([makeCompletedTrainingResponse()]);
  }),
];
