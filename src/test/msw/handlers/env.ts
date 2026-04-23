/**
 * MSW Handler: /api/env
 *
 * Returns the backend port configuration for tests.
 */

import { http, HttpResponse } from 'msw';

export const envHandlers = [
  http.get('/api/env', () => {
    return HttpResponse.json({
      VITE_BACKEND_PORT: 8080,
      VITE_OTEL_PORT: 4317,
      VITE_DISTRI_PORT: 8081,
    });
  }),
];
