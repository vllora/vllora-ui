/**
 * MSW Handler: /finetune/datasets/analytics/dry-run
 *
 * Returns static analytics response for dry-run analytics requests.
 */

import { http, HttpResponse, delay } from 'msw';
import { getScenario } from '../scenarios/scenario-registry';

const BASE = 'http://localhost:8080';

export const analyticsHandlers = [
  http.post(`${BASE}/finetune/datasets/analytics/dry-run`, async () => {
    const scenario = getScenario();
    await delay(scenario.createDelayMs);

    return HttpResponse.json({
      analytics: {
        total_rows: 150,
        avg_message_length: 250,
        topic_distribution: { Pins: 50, Forks: 50, Combos: 50 },
      },
      quality: {
        format_valid: true,
        has_system_messages: true,
        avg_turns: 3.2,
      },
    });
  }),
];
