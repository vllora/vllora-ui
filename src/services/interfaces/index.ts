/**
 * Service Registry
 *
 * Central export point for all service interfaces. Consumers import from here,
 * not from individual adapter files. When we swap from IndexedDB to API adapters,
 * only this file changes.
 *
 * Phase 0 (now): Export interfaces only — no adapter wiring yet.
 * Phase 1+: Export concrete adapter instances bound to the active backend.
 */

export type { DatasetService } from './dataset-service';
export type { RecordService, NewRecord, ScoreUpdate } from './record-service';
export type { WorkflowService, GenerationData } from './workflow-service';
export type { EvalJobService } from './eval-job-service';
export type {
  KnowledgeSourceService,
  ChunkMatch,
  SearchResult,
  CreateKnowledgeSourceOptions,
  UpdateStatusOptions,
} from './knowledge-source-service';
export type {
  IterationStateService,
  IterationPhase,
  ProposedChange,
  IterationHistoryEntry,
  IterationState,
} from './iteration-service';
