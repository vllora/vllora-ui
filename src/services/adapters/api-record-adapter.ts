/**
 * API adapter for RecordService.
 *
 * Calls gateway /finetune/workflows/{workflowId}/records endpoints.
 * Replaces IndexedDB adapter (indexeddb-record-adapter.ts).
 *
 * Mapping: FE workflowId → BE workflowId (same ID after migration)
 */

import { api, handleApiResponse } from '@/lib/api-client';
import { extractDataInfoFromSpan } from '@/utils/modelUtils';
import type { RecordService, NewRecord } from '@/services/interfaces/record-service';
import type { DatasetRecord, Dataset } from '@/types/dataset-types';
import type { Span } from '@/types/common-type';

// ─── BE → FE type mapping ────────────────────────────────────────────────────

interface DbWorkflowRecordResponse {
  readonly id: string;
  readonly workflow_id: string;
  readonly data: string;
  readonly topic: string | null;
  readonly span_id: string | null;
  readonly is_generated: number;
  readonly source_record_id: string | null;
  readonly metadata: string | null;
  readonly created_at: string;
}

interface DbWorkflowRecordScoreResponse {
  readonly id: string;
  readonly record_id: string;
  readonly workflow_id: string;
  readonly job_id: string;
  readonly score_type: string;
  readonly score: number;
  readonly created_at: string;
}

function mapToFe(
  db: DbWorkflowRecordResponse,
  scores: readonly DbWorkflowRecordScoreResponse[],
): DatasetRecord {
  const createdAt = new Date(db.created_at).getTime();
  const recordScores = scores.filter(s => s.record_id === db.id);
  return {
    id: db.id,
    workflowId: db.workflow_id,
    data: JSON.parse(db.data),
    topic: db.topic ?? undefined,
    spanId: db.span_id ?? undefined,
    is_generated: db.is_generated === 1,
    sourceRecordId: db.source_record_id ?? undefined,
    metadata: db.metadata ? JSON.parse(db.metadata) : undefined,
    evaluation: buildEvaluation(recordScores),
    createdAt,
    updatedAt: createdAt,
  };
}

function buildEvaluation(
  scores: readonly DbWorkflowRecordScoreResponse[],
): DatasetRecord['evaluation'] {
  if (scores.length === 0) return undefined;

  const evalScores = scores.filter(s => s.score_type === 'eval');
  const finetuneScores = scores.filter(s => s.score_type === 'finetune');

  // Use the latest score (most recent created_at) for each type
  const latestEval = evalScores.length > 0
    ? evalScores.reduce((a, b) => a.created_at > b.created_at ? a : b)
    : undefined;
  const latestFinetune = finetuneScores.length > 0
    ? finetuneScores.reduce((a, b) => a.created_at > b.created_at ? a : b)
    : undefined;

  if (!latestEval && !latestFinetune) return undefined;

  return {
    evalScore: latestEval?.score,
    evalCount: evalScores.length,
    finetuneScore: latestFinetune?.score,
    finetuneCount: finetuneScores.length,
  };
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

function basePath(workflowId: string): string {
  return `/finetune/workflows/${workflowId}/records`;
}

export const apiRecordAdapter: RecordService = {
  async getByDatasetId(workflowId: string, recordIds?: string[]): Promise<DatasetRecord[]> {
    const [recordsResponse, scoresResponse] = await Promise.all([
      api.get(basePath(workflowId)),
      api.get(`${basePath(workflowId)}/scores`),
    ]);
    const recordsData = await handleApiResponse<{ records: DbWorkflowRecordResponse[] }>(recordsResponse);
    const scoresData = await handleApiResponse<{ scores: DbWorkflowRecordScoreResponse[] }>(scoresResponse);

    let records = recordsData.records.map(db => mapToFe(db, scoresData.scores));

    if (recordIds && recordIds.length > 0) {
      const idSet = new Set(recordIds);
      records = records.filter(r => idSet.has(r.id));
    }

    return records.sort((a, b) => b.createdAt - a.createdAt);
  },

  async getCount(workflowId: string): Promise<number> {
    const response = await api.get(`${basePath(workflowId)}/count`);
    const data = await handleApiResponse<{ count: number }>(response);
    return data.count;
  },

  async getTopicCoverageStats(workflowId: string): Promise<{ total: number; withTopic: number }> {
    const response = await api.get(basePath(workflowId));
    const data = await handleApiResponse<{ records: DbWorkflowRecordResponse[] }>(response);
    const total = data.records.length;
    const withTopic = data.records.filter(r => r.topic != null && r.topic !== '').length;
    return { total, withTopic };
  },

  async spanExists(workflowId: string, spanId: string): Promise<boolean> {
    const response = await api.get(basePath(workflowId));
    const data = await handleApiResponse<{ records: DbWorkflowRecordResponse[] }>(response);
    return data.records.some(r => r.span_id === spanId);
  },

  async getDatasetsBySpanId(_spanId: string): Promise<Dataset[]> {
    // Cross-dataset query not supported by current BE endpoints.
    // Would require a new endpoint: GET /finetune/records?span_id=X
    // For now return empty — this is only used for duplicate detection in trace import.
    return [];
  },

  async add(
    workflowId: string,
    records: readonly NewRecord[],
    defaultTopic?: string,
  ): Promise<DatasetRecord[]> {
    const beRecords = records.map(r => {
      const topic = r.topic?.trim() || defaultTopic?.trim() || undefined;
      return {
        id: crypto.randomUUID(),
        data: r.data,
        topic,
        is_generated: r.is_generated ?? false,
        source_record_id: r.sourceRecordId,
        metadata: r.metadata ? JSON.stringify(r.metadata) : undefined,
      };
    });

    const response = await api.post(basePath(workflowId), { records: beRecords });
    await handleApiResponse<{ added: number }>(response);

    // Server uses client-provided IDs for records (id is required in RecordInput)
    const now = Date.now();
    return beRecords.map((r, i) => ({
      id: r.id,
      workflowId,
      data: records[i].data,
      metadata: records[i].metadata,
      topic: r.topic,
      is_generated: r.is_generated,
      sourceRecordId: r.source_record_id,
      evaluation: records[i].evaluation,
      createdAt: now,
      updatedAt: now,
    }));
  },

  async addFromSpans(
    workflowId: string,
    spans: readonly Span[],
    topic?: string,
  ): Promise<number> {
    const records: NewRecord[] = spans.map(span => ({
      data: extractDataInfoFromSpan(span),
      topic: topic?.trim() || undefined,
      is_generated: false,
    }));

    const result = await this.add(workflowId, records);
    return result.length;
  },

  async updateTopic(workflowId: string, recordId: string, topic: string): Promise<void> {
    const response = await api.patch(
      `${basePath(workflowId)}/${recordId}`,
      { topic: topic || null },
    );
    await handleApiResponse<{ updated: boolean }>(response);
  },

  async updateTopicsBatch(workflowId: string, updates: Map<string, string>): Promise<number> {
    const updatesList = Array.from(updates.entries()).map(([recordId, topic]) => ({
      record_id: recordId,
      topic,
    }));

    const response = await api.patch(`${basePath(workflowId)}/topics`, {
      updates: updatesList,
    });
    await handleApiResponse<{ updated: boolean }>(response);
    return updatesList.length;
  },

  async updateData(workflowId: string, recordId: string, data: unknown): Promise<void> {
    const response = await api.patch(
      `${basePath(workflowId)}/${recordId}/data`,
      { data: JSON.stringify(data) },
    );
    await handleApiResponse<{ updated: boolean }>(response);
  },

  async delete(workflowId: string, recordId: string): Promise<void> {
    const response = await api.delete(`${basePath(workflowId)}/${recordId}`);
    await handleApiResponse<{ deleted: boolean }>(response);
  },

  async clearAll(workflowId: string): Promise<number> {
    const response = await api.delete(basePath(workflowId));
    const data = await handleApiResponse<{ deleted: number }>(response);
    return data.deleted;
  },

  async clearAllTopics(workflowId: string): Promise<number> {
    const response = await api.delete(`${basePath(workflowId)}/topics`);
    const data = await handleApiResponse<{ cleared: number }>(response);
    return data.cleared;
  },

  async renameTopic(workflowId: string, oldName: string, newName: string): Promise<number> {
    const response = await api.patch(`${basePath(workflowId)}/rename-topic`, {
      old_name: oldName,
      new_name: newName,
    });
    const data = await handleApiResponse<{ renamed: number }>(response);
    return data.renamed;
  },

  async clearTopic(workflowId: string, topicName: string): Promise<number> {
    const response = await api.delete(
      `${basePath(workflowId)}/topics/${encodeURIComponent(topicName)}`,
    );
    const data = await handleApiResponse<{ cleared: number }>(response);
    return data.cleared;
  },
};
