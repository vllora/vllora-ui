/**
 * Record Service Interface
 *
 * Abstraction over dataset record persistence. Backed by Gateway API (api-record-adapter.ts).
 */

import type { DatasetRecord, DatasetEvaluation, Dataset } from '@/types/dataset-types';
import type { Span } from '@/types/common-type';

export interface NewRecord {
  readonly data: unknown;
  readonly metadata?: Record<string, unknown>;
  readonly topic?: string;
  readonly is_generated?: boolean;
  readonly sourceRecordId?: string;
  readonly evaluation?: DatasetEvaluation;
}

export interface ScoreUpdate {
  readonly evalScore?: number;
  readonly finetuneScore?: number;
}

export interface RecordService {
  // Queries
  getByDatasetId(workflowId: string, recordIds?: string[]): Promise<DatasetRecord[]>;
  getCount(workflowId: string): Promise<number>;
  getTopicCoverageStats(workflowId: string): Promise<{ total: number; withTopic: number }>;
  spanExists(workflowId: string, spanId: string): Promise<boolean>;
  getDatasetsBySpanId(spanId: string): Promise<Dataset[]>;

  // Creation
  add(workflowId: string, records: readonly NewRecord[], defaultTopic?: string): Promise<DatasetRecord[]>;
  addFromSpans(workflowId: string, spans: readonly Span[], topic?: string): Promise<number>;

  // Updates
  updateTopic(workflowId: string, recordId: string, topic: string): Promise<void>;
  updateTopicsBatch(workflowId: string, updates: Map<string, string>): Promise<number>;
  updateData(workflowId: string, recordId: string, data: unknown): Promise<void>;
  updateEvalScores(workflowId: string, recordId: string, update: ScoreUpdate): Promise<void>;
  updateEvaluation(workflowId: string, recordId: string, score: number | undefined): Promise<void>;

  // Deletion & cleanup
  delete(workflowId: string, recordId: string): Promise<void>;
  clearAll(workflowId: string): Promise<number>;
  clearAllTopics(workflowId: string): Promise<number>;
  renameTopic(workflowId: string, oldName: string, newName: string): Promise<number>;
  clearTopic(workflowId: string, topicName: string): Promise<number>;
}
