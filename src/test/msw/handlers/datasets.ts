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

  // GET /finetune/datasets/:datasetId/evaluator/versions — Evaluator version history
  http.get(`${BASE}/finetune/datasets/:datasetId/evaluator/versions`, async ({ params }) => {
    const datasetId = params.datasetId as string;
    const scenario = getScenario();
    await delay(scenario.pollDelayMs);

    return HttpResponse.json(makeEvaluatorVersionsResponse(datasetId));
  }),

  // PATCH /finetune/datasets/:datasetId/evaluator — Update eval script
  http.patch(`${BASE}/finetune/datasets/:datasetId/evaluator`, async () => {
    const scenario = getScenario();
    await delay(scenario.createDelayMs);

    return HttpResponse.json({
      dataset_id: 'ds-backend-001',
      updated: true,
    });
  }),
];
