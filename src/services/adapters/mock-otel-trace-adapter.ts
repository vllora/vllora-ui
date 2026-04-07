/**
 * Mock adapter for OtelTraceService.
 *
 * Reads from in-memory fixtures so the trace UI works without a backend.
 * Swap to a real adapter via service-registry once the coworker's OTel
 * ingest API ships — the interface is identical.
 */

import { emitter } from '@/utils/eventEmitter';
import type { OtelTraceService, UseAsFinetuneInputResult } from '@/services/interfaces/otel-trace-service';
import type {
  OtelConversation,
  OtelTrace,
  OtelTraceFilters,
  OtelTraceListResult,
} from '@/types/otel-trace-types';
import { MOCK_OTEL_TRACES } from '@/mocks/otel-traces/fixtures';

// ─── Filtering ───────────────────────────────────────────────────────────────

function traceMatches(trace: OtelTrace, filters: OtelTraceFilters): boolean {
  if (filters.model && trace.rootSpan.requestModel !== filters.model) return false;
  if (filters.provider && trace.rootSpan.providerName !== filters.provider) return false;
  if (filters.hasToolCalls && trace.toolCallCount === 0) return false;
  if (filters.hasError && trace.rootSpan.status !== 'error') return false;
  if (filters.minTurns !== undefined && trace.turnCount < filters.minTurns) return false;
  if (filters.since && trace.rootSpan.startTime < filters.since) return false;
  if (filters.until && trace.rootSpan.startTime > filters.until) return false;

  if (filters.search) {
    const needle = filters.search.toLowerCase();
    const haystack = trace.spans
      .flatMap((s) => [
        s.systemInstructions ?? '',
        ...(s.inputMessages ?? []).flatMap((m) =>
          m.parts.map((p) => (p.type === 'text' ? p.content : JSON.stringify(p))),
        ),
        ...(s.outputMessages ?? []).flatMap((m) =>
          m.parts.map((p) => (p.type === 'text' ? p.content : JSON.stringify(p))),
        ),
      ])
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

// ─── Conversation aggregation ────────────────────────────────────────────────

function buildConversation(conversationId: string, traces: OtelTrace[]): OtelConversation {
  const sorted = [...traces].sort((a, b) => a.rootSpan.startTime.localeCompare(b.rootSpan.startTime));
  const models = new Set<string>();
  let toolCallCount = 0;
  let turnCount = 0;
  let totalTokens = 0;
  for (const t of sorted) {
    if (t.rootSpan.requestModel) models.add(t.rootSpan.requestModel);
    toolCallCount += t.toolCallCount;
    turnCount += t.turnCount;
    totalTokens += t.totalTokens ?? 0;
  }
  return {
    conversationId,
    traces: sorted,
    firstSeen: sorted[0]?.rootSpan.startTime ?? '',
    lastSeen: sorted[sorted.length - 1]?.rootSpan.endTime ?? '',
    turnCount,
    toolCallCount,
    totalTokens,
    models: Array.from(models),
  };
}

// ─── Stub finetune-input handoff ─────────────────────────────────────────────

interface FinetuneHandoffRecord {
  readonly traceIds: string[];
  readonly datasetId: string;
  readonly at: string;
}
const handoffLog: FinetuneHandoffRecord[] = [];

/** Inspectable from devtools / tests. */
export function _getMockFinetuneHandoffs(): readonly FinetuneHandoffRecord[] {
  return handoffLog;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export const mockOtelTraceAdapter: OtelTraceService = {
  async list(filters: OtelTraceFilters = {}): Promise<OtelTraceListResult> {
    const matched = MOCK_OTEL_TRACES.filter((t) => traceMatches(t, filters));
    const sorted = [...matched].sort((a, b) =>
      b.rootSpan.startTime.localeCompare(a.rootSpan.startTime),
    );
    return { traces: sorted, total: sorted.length };
  },

  async get(traceId: string): Promise<OtelTrace | null> {
    return MOCK_OTEL_TRACES.find((t) => t.traceId === traceId) ?? null;
  },

  async getConversation(conversationId: string): Promise<OtelConversation | null> {
    const traces = MOCK_OTEL_TRACES.filter((t) => t.conversationId === conversationId);
    if (traces.length === 0) return null;
    return buildConversation(conversationId, traces);
  },

  async useAsFinetuneInput(
    traceIds: string[],
    datasetId: string,
  ): Promise<UseAsFinetuneInputResult> {
    if (traceIds.length === 0) {
      throw new Error('useAsFinetuneInput: no trace ids provided');
    }
    if (!datasetId) {
      throw new Error('useAsFinetuneInput: datasetId is required');
    }
    handoffLog.push({ traceIds, datasetId, at: new Date().toISOString() });
    // Notify any KnowledgeSourcesContext listeners that new sources will appear.
    emitter.emit('vllora_knowledge_source_updated', { workflowId: datasetId });
    return { sourcesCreated: traceIds.length, datasetId };
  },

  async listModels(): Promise<string[]> {
    const set = new Set<string>();
    for (const t of MOCK_OTEL_TRACES) {
      if (t.rootSpan.requestModel) set.add(t.rootSpan.requestModel);
    }
    return Array.from(set).sort();
  },
};
