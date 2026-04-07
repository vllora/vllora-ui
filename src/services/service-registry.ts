/**
 * Service Registry
 *
 * Singleton instances of all service adapters. Import from here instead of
 * directly from adapter modules.
 *
 * All services use Gateway API adapters (no IndexedDB dependency).
 */

import { apiDatasetAdapter } from '@/services/adapters/api-dataset-adapter';
import { apiRecordAdapter } from '@/services/adapters/api-record-adapter';
import { apiEvalJobAdapter } from '@/services/adapters/api-eval-job-adapter';
import { apiKnowledgeSourceAdapter } from '@/services/adapters/api-knowledge-source-adapter';
import { apiWorkflowAdapter } from '@/services/adapters/api-workflow-adapter';
import { apiIterationAdapter } from '@/services/adapters/api-iteration-adapter';
import { mockOtelTraceAdapter } from '@/services/adapters/mock-otel-trace-adapter';

export const datasetService = apiDatasetAdapter;
export const recordService = apiRecordAdapter;
export const evalJobService = apiEvalJobAdapter;
export const knowledgeSourceService = apiKnowledgeSourceAdapter;
export const workflowService = apiWorkflowAdapter;
export const iterationStateService = apiIterationAdapter;

// OTel GenAI traces — currently mock-only. Swap to a real API adapter once
// the coworker's OTel ingest endpoint ships. The interface lives in
// src/services/interfaces/otel-trace-service.ts.
export const otelTraceService = mockOtelTraceAdapter;

// Backward-compatible alias (old name -> new name)
/** @deprecated Use evalJobService instead */
export const dryRunJobService = evalJobService;
