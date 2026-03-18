/**
 * API adapter for DatasetService.
 *
 * Calls gateway /finetune/workflows endpoints.
 * Replaces IndexedDB adapter (indexeddb-dataset-adapter.ts).
 *
 * Mapping: FE "Dataset" → BE "Workflow"
 *
 * The BE workflow stores: name, objective, eval_script.
 * Topic hierarchy is stored in the workflow_topics table via separate endpoints.
 * Derived metadata (coverageStats, evalStats, etc.) is computed on-demand.
 */

import { api, handleApiResponse, parseUtcTimestamp } from '@/lib/api-client';
import { invalidateTopicCache } from '@/services/adapters/api-record-adapter';
import type { DatasetService } from '@/services/interfaces/dataset-service';
import type {
  Dataset,
  TopicHierarchyConfig,
  TopicHierarchyNode,
  CoverageStats,
  KnowledgeCoverageStats,
  EvalStats,
  DatasetStats,
  SampleTrainingConfig,
} from '@/types/dataset-types';

// ─── BE → FE type mapping ────────────────────────────────────────────────────

interface DbWorkflowResponse {
  readonly id: string;
  readonly name: string;
  readonly objective: string;
  readonly eval_script: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
}

/** Extended response from GET /finetune/workflows/:id (single workflow) */
interface DbWorkflowDetailResponse extends DbWorkflowResponse {
  readonly records_count: number;
  readonly eval_job_ids: string[];
  readonly finetune_job_ids: string[];
}

function mapToFe(db: DbWorkflowResponse): Dataset {
  return {
    id: db.id,
    name: db.name,
    datasetObjective: db.objective,
    evalScript: db.eval_script ?? undefined,
    createdAt: parseUtcTimestamp(db.created_at),
    updatedAt: parseUtcTimestamp(db.updated_at),
  };
}

function mapDetailToFe(db: DbWorkflowDetailResponse): Dataset {
  return {
    ...mapToFe(db),
    recordsCount: db.records_count,
    evalJobIds: db.eval_job_ids,
    finetuneJobIds: db.finetune_job_ids,
  };
}

// ─── Topic hierarchy helpers ─────────────────────────────────────────────────

interface DbTopicResponse {
  readonly id: string;
  readonly workflow_id: string;
  readonly name: string;
  readonly parent_id: string | null;
  readonly selected: number;
  readonly source_chunk_refs: string | null;
  readonly created_at: string;
}

/** Extra FE-only fields stored as JSON in the BE source_chunk_refs column */
interface TopicMetadata {
  sourceChunkRefs?: string[];
  description?: string;
  promptTemplate?: string;
  normalizedPromptSegment?: string;
}

/** Row from the workflow_topic_sources bridge table */
interface DbTopicRelation {
  readonly id: string;
  readonly topic_id: string;
  readonly source_part_id: string;
  readonly reference_id: string | null;
}

type FlatTopic = { id: string; name: string; parent_id: string | null; selected: boolean; source_chunk_refs: TopicMetadata | null };

/** Flatten a FE hierarchy tree into flat rows with parent_id for the BE.
 *  Uses UUIDs for DB IDs to avoid cross-workflow collisions. */
function flattenHierarchy(
  nodes: readonly TopicHierarchyNode[],
  parentId: string | null,
): FlatTopic[] {
  const result: FlatTopic[] = [];
  for (const node of nodes) {
    const meta: TopicMetadata = {};
    if (node.sourceChunkRefs?.length) meta.sourceChunkRefs = node.sourceChunkRefs;
    if (node.description) meta.description = node.description;
    if (node.promptTemplate) meta.promptTemplate = node.promptTemplate;
    if (node.normalizedPromptSegment) meta.normalizedPromptSegment = node.normalizedPromptSegment;

    const dbId = crypto.randomUUID();
    result.push({
      id: dbId,
      name: node.name,
      parent_id: parentId,
      selected: node.selected ?? true,
      source_chunk_refs: Object.keys(meta).length > 0 ? meta : null,
    });

    if (node.children?.length) {
      result.push(...flattenHierarchy(node.children, dbId));
    }
  }
  return result;
}

/** Reconstruct a FE hierarchy tree from flat BE topic rows */
function buildHierarchyTree(rows: readonly DbTopicResponse[]): TopicHierarchyNode[] {
  const nodeMap = new Map<string, TopicHierarchyNode>();
  const roots: TopicHierarchyNode[] = [];

  // First pass: create all nodes
  for (const row of rows) {
    let meta: TopicMetadata = {};
    if (row.source_chunk_refs) {
      try { meta = JSON.parse(row.source_chunk_refs); } catch { /* ignore */ }
    }

    nodeMap.set(row.id, {
      id: row.id,
      name: row.name,
      selected: row.selected === 1,
      description: meta.description,
      sourceChunkRefs: meta.sourceChunkRefs,
      promptTemplate: meta.promptTemplate,
      normalizedPromptSegment: meta.normalizedPromptSegment,
      children: undefined,
    });
  }

  // Second pass: link children to parents
  for (const row of rows) {
    const node = nodeMap.get(row.id)!;
    if (row.parent_id && nodeMap.has(row.parent_id)) {
      const parent = nodeMap.get(row.parent_id)!;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/** Calculate max depth of a hierarchy tree */
function calcMaxDepth(nodes: readonly TopicHierarchyNode[], depth = 1): number {
  let max = depth;
  for (const node of nodes) {
    if (node.children?.length) {
      max = Math.max(max, calcMaxDepth(node.children, depth + 1));
    }
  }
  return max;
}

/** Merge relations from the bridge table into hierarchy nodes' sourceChunkRefs.
 *  Relations store plain partId UUIDs; Lucy path stores "sourceId:chunkId" composites.
 *  Both formats are kept — resolvePartRef() handles either at render time. */
function mergeRelationsIntoHierarchy(
  nodes: TopicHierarchyNode[],
  relations: readonly DbTopicRelation[],
): void {
  const relMap = new Map<string, string[]>();
  for (const rel of relations) {
    const existing = relMap.get(rel.topic_id) ?? [];
    existing.push(rel.source_part_id);
    relMap.set(rel.topic_id, existing);
  }

  const walk = (list: TopicHierarchyNode[]) => {
    for (const node of list) {
      const partIds = relMap.get(node.id);
      if (partIds?.length) {
        const merged = new Set(node.sourceChunkRefs ?? []);
        for (const pid of partIds) merged.add(pid);
        node.sourceChunkRefs = [...merged];
      }
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
}

/** Fetch topics from gateway and reconstruct as TopicHierarchyConfig */
async function fetchTopicHierarchy(workflowId: string): Promise<TopicHierarchyConfig | undefined> {
  try {
    const response = await api.get(`${BASE}/${workflowId}/topics`);
    const data = await handleApiResponse<{ topics: DbTopicResponse[] }>(response);
    if (!data.topics || data.topics.length === 0) return undefined;

    const hierarchy = buildHierarchyTree(data.topics);

    // Merge relations from bridge table (skill-uploaded path)
    try {
      const relResponse = await api.get(`${BASE}/${workflowId}/topics/relations`);
      if (relResponse.ok) {
        const relData = await handleApiResponse<{ relations: DbTopicRelation[] }>(relResponse);
        if (relData.relations?.length) {
          mergeRelationsIntoHierarchy(hierarchy, relData.relations);
        }
      }
    } catch { /* relations endpoint may not exist — degrade gracefully */ }

    return {
      hierarchy,
      depth: calcMaxDepth(hierarchy),
      generatedAt: parseUtcTimestamp(data.topics[0].created_at),
    };
  } catch {
    return undefined;
  }
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

const BASE = '/finetune/workflows';

export const apiDatasetAdapter: DatasetService = {
  async getById(id: string): Promise<Dataset | null> {
    const response = await api.get(`${BASE}/${id}`);
    if (!response.ok && response.status === 404) return null;
    const db = await handleApiResponse<DbWorkflowDetailResponse>(response);
    const dataset = mapDetailToFe(db);
    const topicHierarchy = await fetchTopicHierarchy(id);
    if (topicHierarchy) dataset.topicHierarchy = topicHierarchy;
    return dataset;
  },

  async getAll(): Promise<Dataset[]> {
    const response = await api.get(BASE);
    const workflows = await handleApiResponse<DbWorkflowResponse[]>(response);
    return workflows.map(mapToFe);
  },

  async create(name: string, objective?: string): Promise<Dataset> {
    const response = await api.post(BASE, {
      name,
      objective: objective ?? '',
    });
    const db = await handleApiResponse<DbWorkflowResponse>(response);
    return mapToFe(db);
  },

  async rename(id: string, name: string): Promise<void> {
    const response = await api.put(`${BASE}/${id}`, { name });
    await handleApiResponse<DbWorkflowResponse>(response);
  },

  async delete(id: string): Promise<void> {
    const response = await api.delete(`${BASE}/${id}`);
    await handleApiResponse<{ id: string; deleted: boolean }>(response);
  },

  async updateObjective(id: string, objective: string, _normalizedObjective?: string): Promise<void> {
    const response = await api.put(`${BASE}/${id}`, { objective });
    await handleApiResponse<DbWorkflowResponse>(response);
  },

  async updateTopicHierarchy(id: string, topics: TopicHierarchyConfig): Promise<void> {
    const flat = topics.hierarchy?.length
      ? flattenHierarchy(topics.hierarchy, null)
      : [];

    // Delete existing topics first, then create new ones.
    // PUT expects TopicUpdateInput (with identifier), but we generate fresh UUIDs,
    // so delete-then-create is the correct pattern.
    const existingRes = await api.get(`${BASE}/${id}/topics`);
    const existing = await handleApiResponse<{ topics: DbTopicResponse[] }>(existingRes);
    if (existing.topics.length > 0) {
      const ids = existing.topics.map((t) => t.id);
      await api.delete(`${BASE}/${id}/topics`, { body: JSON.stringify({ identifiers: ids }), headers: { 'Content-Type': 'application/json' } });
    }

    if (flat.length > 0) {
      const response = await api.post(`${BASE}/${id}/topics`, { topics: flat });
      await handleApiResponse<{ created: number }>(response);
    }

    // Invalidate record adapter's topic name↔id cache since IDs changed
    invalidateTopicCache(id);
  },

  async updateEvalScript(id: string, script: string): Promise<void> {
    const response = await api.put(`${BASE}/${id}`, { eval_script: script });
    await handleApiResponse<DbWorkflowResponse>(response);
  },

  async updateCoverageStats(_id: string, _stats: CoverageStats): Promise<void> {
    // Computed on-demand from records. No BE storage needed.
  },

  async updateKnowledgeCoverageStats(_id: string, _stats: KnowledgeCoverageStats): Promise<void> {
    // Computed on-demand from knowledge sources. No BE storage needed.
  },

  async updateEvalStats(_id: string, _stats: EvalStats): Promise<void> {
    // Computed on-demand from eval jobs. No BE storage needed.
  },

  async updateDatasetStats(_id: string, _stats: DatasetStats): Promise<void> {
    // Computed on-demand from records. No BE storage needed.
  },

  async updateTrainingConfig(_id: string, _config: SampleTrainingConfig): Promise<void> {
    // Training config is managed by the finetune job system. No BE storage needed.
    // TODO: Add a training_config column to workflows if we want to persist this.
  },

  async updateReadme(_id: string, _readme: string, _source?: 'template' | 'agent'): Promise<void> {
    // README is generated on-demand. No BE storage needed.
    // TODO: Add a readme column to workflows if we want to persist this.
  },
};
