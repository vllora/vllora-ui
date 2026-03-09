/**
 * MSW Handlers Index
 *
 * Combines all handler arrays into a single export for MSW setup.
 */

import { envHandlers } from './env';
import { datasetHandlers } from './datasets';
import { evaluationHandlers } from './evaluations';
import { trainingJobHandlers } from './training-jobs';
import { finetuneEvaluationHandlers } from './finetune-evaluations';
import { analyticsHandlers } from './analytics';

export const allHandlers = [
  ...envHandlers,
  ...datasetHandlers,
  ...evaluationHandlers,
  ...trainingJobHandlers,
  ...finetuneEvaluationHandlers,
  ...analyticsHandlers,
];
