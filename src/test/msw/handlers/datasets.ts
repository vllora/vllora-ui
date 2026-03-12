/**
 * MSW Handler: /finetune/datasets
 *
 * Handles dataset upload and evaluator update endpoints.
 */

import { http, HttpResponse, delay } from 'msw';
import { getScenario } from '../scenarios/scenario-registry';
import { makeUploadResponse, makeEvaluatorVersionsResponse } from '../scenarios/eval-scenario-bridge';

const BASE = 'http://localhost:8080';

export const datasetHandlers = [
  // POST /finetune/datasets — Upload dataset
  http.post(`${BASE}/finetune/datasets`, async () => {
    const scenario = getScenario();
    await delay(scenario.createDelayMs);

    if (scenario.uploadBehavior === 'error') {
      return HttpResponse.json(
        { error: 'Upload failed: invalid format' },
        { status: 400 },
      );
    }

    if (scenario.uploadBehavior === 'timeout') {
      await delay(30_000);
      return HttpResponse.error();
    }

    return HttpResponse.json(makeUploadResponse());
  }),

  // GET /finetune/workflows/:workflowId/evaluator/versions — Evaluator version history
  http.get(`${BASE}/finetune/workflows/:workflowId/evaluator/versions`, async ({ params }) => {
    const workflowId = params.workflowId as string;
    const scenario = getScenario();
    await delay(scenario.pollDelayMs);

    return HttpResponse.json(makeEvaluatorVersionsResponse(workflowId));
  }),

  // PATCH /finetune/workflows/:workflowId/evaluator — Update eval script
  http.patch(`${BASE}/finetune/workflows/:workflowId/evaluator`, async () => {
    const scenario = getScenario();
    await delay(scenario.createDelayMs);

    return HttpResponse.json({
      workflow_id: 'wf-backend-001',
      updated: true,
    });
  }),
];
