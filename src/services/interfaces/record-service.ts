/**
 * Record Service Interface
 *
 * Abstraction over dataset record persistence. Currently backed by IndexedDB (datasets-db.ts).
 * Will be swapped to gateway API adapter when /finetune/workflows/{id}/records endpoints are ready.
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
  getByDatasetId(datasetId: string, recordIds?: string[]): Promise<DatasetRecord[]>;
  getCount(datasetId: string): Promise<number>;
  getTopicCoverageStats(datasetId: string): Promise<{ total: number; withTopic: number }>;
  spanExists(datasetId: string, spanId: string): Promise<boolean>;
  getDatasetsBySpanId(spanId: string): Promise<Dataset[]>;

  // Creation
  add(datasetId: string, records: readonly NewRecord[], defaultTopic?: string): Promise<DatasetRecord[]>;
  addFromSpans(datasetId: string, spans: readonly Span[], topic?: string): Promise<number>;

  // Updates
  updateTopic(datasetId: string, recordId: string, topic: string): Promise<void>;
  updateTopicsBatch(datasetId: string, updates: Map<string, string>): Promise<number>;
  updateData(datasetId: string, recordId: string, data: unknown): Promise<void>;
  updateEvalScores(datasetId: string, recordId: string, update: ScoreUpdate): Promise<void>;
  updateEvaluation(datasetId: string, recordId: string, score: number | undefined): Promise<void>;

  // Deletion & cleanup
  delete(datasetId: string, recordId: string): Promise<void>;
  clearAll(datasetId: string): Promise<number>;
  clearAllTopics(datasetId: string): Promise<number>;
  renameTopic(datasetId: string, oldName: string, newName: string): Promise<number>;
  clearTopic(datasetId: string, topicName: string): Promise<number>;
}
