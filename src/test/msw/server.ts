/**
 * MSW Server (Node.js / Vitest)
 *
 * Sets up the MSW server for intercepting HTTP requests in tests.
 */

import { setupServer } from 'msw/node';
import { allHandlers } from './handlers';

export const server = setupServer(...allHandlers);
