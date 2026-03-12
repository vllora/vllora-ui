/**
 * Dataset Service Interface
 *
 * Abstraction over dataset persistence. Backed by Gateway API (api-dataset-adapter.ts).
 *
 * Consumers should import from the service registry, not directly from adapters.
 */

import type {
  Dataset,
  TopicHierarchyConfig,
  CoverageStats,
  KnowledgeCoverageStats,
  EvalStats,
  DatasetStats,
  SampleTrainingConfig,
} from '@/types/dataset-types';

export interface DatasetService {
  // CRUD
  getById(id: string): Promise<Dataset | null>;
  getAll(): Promise<Dataset[]>;
  create(name: string, objective?: string): Promise<Dataset>;
  rename(id: string, name: string): Promise<void>;
  delete(id: string): Promise<void>;

  // Metadata updates
  updateObjective(id: string, objective: string, normalizedObjective?: string): Promise<void>;
  updateTopicHierarchy(id: string, topics: TopicHierarchyConfig): Promise<void>;
  updateEvalScript(id: string, script: string): Promise<void>;
  updateCoverageStats(id: string, stats: CoverageStats): Promise<void>;
  updateKnowledgeCoverageStats(id: string, stats: KnowledgeCoverageStats): Promise<void>;
  updateEvalStats(id: string, stats: EvalStats): Promise<void>;
  updateDatasetStats(id: string, stats: DatasetStats): Promise<void>;
  updateTrainingConfig(id: string, config: SampleTrainingConfig): Promise<void>;
  updateReadme(id: string, readme: string, source?: 'template' | 'agent'): Promise<void>;
}
