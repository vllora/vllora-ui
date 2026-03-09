/**
 * MSW Vitest Setup
 *
 * Lifecycle hooks for MSW in Vitest.
 * Add this file to vitest.config.ts setupFiles to enable MSW globally,
 * or import { server } directly in individual test files for selective use.
 */

import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';
import { resetScenario } from './scenarios/scenario-registry';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
});

afterEach(() => {
  server.resetHandlers();
  resetScenario();
});

afterAll(() => {
  server.close();
});
