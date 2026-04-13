/**
 * OtelTraceBundleLoader
 *
 * Thin wrapper around OtelTraceSourceViewer that fetches semconv spans from
 * the gateway's `GET /trace-bundles/{id}` endpoint when the source has a
 * `traceBundleId`. Falls back to the source-parts-based rendering when the
 * gateway is unreachable or no bundle ID is present.
 */

import { useRequest } from 'ahooks';
import { OtelTraceSourceViewer } from './OtelTraceSourceViewer';
import { fetchTraceBundleSpans } from '@/services/service-registry';
import type { KnowledgeSource } from '@/types/knowledge-types';

interface OtelTraceBundleLoaderProps {
  readonly source: KnowledgeSource;
}

export function OtelTraceBundleLoader({ source }: OtelTraceBundleLoaderProps) {
  const bundleId = source.traceBundleId;

  const { data: spans, loading } = useRequest(
    async () => {
      if (!bundleId) return null;
      return fetchTraceBundleSpans(source.workflowId, bundleId);
    },
    {
      refreshDeps: [bundleId, source.workflowId],
    },
  );

  if (loading && bundleId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading trace bundle...
      </div>
    );
  }

  return (
    <OtelTraceSourceViewer
      source={source}
      semconvSpans={spans ?? undefined}
    />
  );
}
