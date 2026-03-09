/**
 * MSW Handler: /finetune/evaluations
 *
 * Handles evaluation creation and polling with stateful poll counters.
 * After N polls (configured via evalPollsBeforeComplete), returns completed.
 */

import { http, HttpResponse, delay } from 'msw';
import { getScenario, incrementEvalPoll } from '../scenarios/scenario-registry';
import {
  makeCreateEvalResponse,
  makeRunningEvalResponse,
  makeCompletedEvalResponse,
  makeFailedEvalResponse,
} from '../scenarios/eval-scenario-bridge';

const BASE = 'http://localhost:8080';

export const evaluationHandlers = [
  // POST /finetune/evaluations — Create evaluation run
  http.post(`${BASE}/finetune/evaluations`, async () => {
    const scenario = getScenario();
    await delay(scenario.createDelayMs);

    if (scenario.evalCreateBehavior === 'error') {
      return HttpResponse.json(
        { error: 'Failed to create evaluation: dataset not found' },
        { status: 404 },
      );
    }

    return HttpResponse.json(makeCreateEvalResponse());
  }),

  // GET /finetune/evaluations/:id — Poll evaluation status
  http.get(`${BASE}/finetune/evaluations/:id`, async ({ params }) => {
    const runId = params.id as string;
    const scenario = getScenario();
    await delay(scenario.pollDelayMs);

    const pollCount = incrementEvalPoll(runId);
    const totalRows = 10;

    // Still running — not enough polls yet
    if (pollCount <= scenario.evalPollsBeforeComplete) {
      const completedRows = Math.floor(
        (pollCount / (scenario.evalPollsBeforeComplete + 1)) * totalRows,
      );
      return HttpResponse.json(
        makeRunningEvalResponse(runId, completedRows, totalRows),
      );
    }

    // Error scenario
    if (scenario.evalScenario === 'error') {
      return HttpResponse.json(makeFailedEvalResponse(runId));
    }

    // Completed with scenario-appropriate results
    return HttpResponse.json(
      makeCompletedEvalResponse(scenario.evalScenario, runId, totalRows),
    );
  }),
];
