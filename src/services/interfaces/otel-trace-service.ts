/**
 * OTel Trace Service Interface
 *
 * Read-only browser of OTel GenAI traces a coworker's ingest API has stored.
 * The "use as finetune input" handoff is the only write — and it is itself a
 * write to a manifest the skill picks up, not a mutation of trace data.
 */

import type {
  OtelTrace,
  OtelConversation,
  OtelTraceFilters,
  OtelTraceListResult,
} from '@/types/otel-trace-types';

export interface UseAsFinetuneInputResult {
  /** Number of knowledge sources created (one per trace). */
  readonly sourcesCreated: number;
  /** The dataset id the sources were attached to. */
  readonly datasetId: string;
}

export interface OtelTraceService {
  /** Paginated list of traces matching filters. */
  list(filters?: OtelTraceFilters, cursor?: string): Promise<OtelTraceListResult>;

  /** Fetch a single trace by id. */
  get(traceId: string): Promise<OtelTrace | null>;

  /** Fetch all traces sharing a conversation id. */
  getConversation(conversationId: string): Promise<OtelConversation | null>;

  /**
   * Hand selected traces to the finetune pipeline as a knowledge source.
   * Mock adapter records the call and emits `vllora_knowledge_source_updated`
   * so contexts refresh. The real backend will write a manifest the skill picks up.
   */
  useAsFinetuneInput(
    traceIds: string[],
    datasetId: string,
  ): Promise<UseAsFinetuneInputResult>;

  /** Distinct models seen in storage — for the filter dropdown. */
  listModels(): Promise<string[]>;
}
