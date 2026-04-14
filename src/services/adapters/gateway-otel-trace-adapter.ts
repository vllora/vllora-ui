/**
 * Gateway OTel Trace Adapter
 *
 * Fetches trace bundle data from the gateway's `trace_bundles` endpoints.
 * This does NOT implement the full `OtelTraceService` interface (the mock
 * adapter still powers the `/traces` browser). It provides a focused
 * `fetchTraceBundleSpans` function for loading semconv spans from a stored
 * trace bundle — the only gateway call the Sources view needs.
 *
 * The full `OtelTraceService` will be implemented when the coworker's OTel
 * ingest API ships and the `/traces` browser switches from mock to real data.
 */

import { api, handleApiResponse } from '@/lib/api-client';
import type { OtelSemconvSpan } from '@/components/datasets/sources-view/OtelTraceSourceViewer';

/** Shape returned by `GET /finetune/workflows/{wf}/trace-bundles/{id}`. */
interface TraceBundleResponse {
  readonly id: string;
  readonly dataset_id: string;
  readonly name: string;
  readonly span_count: number;
  readonly tool_names: string[];
  readonly model_names: string[];
  readonly semconv_spans: OtelSemconvSpan[];
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Fetch the semconv spans blob for a trace bundle from the gateway.
 *
 * Returns `null` if the bundle doesn't exist (404) or the gateway is
 * unreachable — the caller should fall back to the mock adapter's
 * source-parts-based rendering.
 */
export async function fetchTraceBundleSpans(
  workflowId: string,
  bundleId: string,
): Promise<readonly OtelSemconvSpan[] | null> {
  try {
    const response = await api.get(
      `/finetune/workflows/${workflowId}/trace-bundles/${bundleId}`,
    );
    const bundle = await handleApiResponse<TraceBundleResponse>(response);
    return bundle.semconv_spans;
  } catch {
    // Gateway down or 404 — degrade gracefully
    return null;
  }
}
