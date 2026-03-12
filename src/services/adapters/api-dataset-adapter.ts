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

import { api, handleApiResponse } from '@/lib/api-client';
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

function mapToFe(db: DbWorkflowResponse): Dataset {
  return {
    id: db.id,
    name: db.name,
    datasetObjective: db.objective,
    evalScript: db.eval_script ?? undefined,
    createdAt: new Date(db.created_at).getTime(),
    updatedAt: new Date(db.updated_at).getTime(),
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

/** Fetch topics from gateway and reconstruct as TopicHierarchyConfig */
async function fetchTopicHierarchy(workflowId: string): Promise<TopicHierarchyConfig | undefined> {
  try {
    const response = await api.get(`${BASE}/${workflowId}/topics`);
    const data = await handleApiResponse<{ topics: DbTopicResponse[] }>(response);
    if (!data.topics || data.topics.length === 0) return undefined;

    const hierarchy = buildHierarchyTree(data.topics);
    return {
      hierarchy,
      depth: calcMaxDepth(hierarchy),
      generatedAt: new Date(data.topics[0].created_at).getTime(),
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
    const db = await handleApiResponse<DbWorkflowResponse>(response);
    const dataset = mapToFe(db);
    const topicHierarchy = await fetchTopicHierarchy(id);
    console.log('[api-dataset] getById', id, 'topicHierarchy:', topicHierarchy ? `${topicHierarchy.hierarchy?.length} roots` : 'none');
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
    const response = await api.put(`${BASE}/${id}/topics`, { topics: flat });
    await handleApiResponse<{ replaced: number }>(response);
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
