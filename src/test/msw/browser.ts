/**
 * MSW Browser Worker (Dev E2E)
 *
 * Sets up MSW in the browser for interactive testing.
 * Start with: VITE_MSW_ENABLED=true pnpm dev
 *
 * This file is conditionally imported in main.tsx.
 */

import { setupWorker } from 'msw/browser';
import { allHandlers } from './handlers';

export const worker = setupWorker(...allHandlers);
