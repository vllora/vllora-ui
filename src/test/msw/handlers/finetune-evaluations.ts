/**
 * MSW Handler: /finetune/datasets/:id/finetune-evaluations
 *
 * Returns per-epoch training evaluation data based on training scenario.
 */

import { http, HttpResponse, delay } from 'msw';
import { getScenario } from '../scenarios/scenario-registry';
import { makeFinetuneEvalResponse } from '../scenarios/training-scenario-bridge';

const BASE = 'http://localhost:8080';

export const finetuneEvaluationHandlers = [
  http.get(
    `${BASE}/finetune/datasets/:datasetId/finetune-evaluations`,
    async () => {
      const scenario = getScenario();
      await delay(scenario.pollDelayMs);

      return HttpResponse.json(
        makeFinetuneEvalResponse(scenario.trainingScenario),
      );
    },
  ),
];
