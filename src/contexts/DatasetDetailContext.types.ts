/**
 * Type definitions for DatasetDetailContext
 */

import type { Dataset, DatasetRecord, TopicHierarchyConfig, TopicHierarchyNode } from "@/types/dataset-types";
import type { ColumnVisibility } from "@/components/datasets/table-columns";
import type { SortConfig } from "@/components/datasets/RecordsToolbar";
import type { ImportMode } from "@/components/datasets/IngestDataDialog";
import type { DeleteConfirmation } from "@/components/datasets/DeleteConfirmationDialog";
import type { GenerationConfig } from "@/components/datasets/GenerateSyntheticDataDialog";

export type GeneratedFilter = "all" | "generated" | "not_generated";

export interface DatasetDetailContextType {
  // Core data
  dataset: Dataset | null;
  records: DatasetRecord[];
  sortedRecords: DatasetRecord[];
  isLoading: boolean;
  datasetId: string;

  // Navigation
  datasets: Dataset[];
  datasetRecordCounts: Record<string, number>;
  onBack: () => void;
  onSelectDataset?: (datasetId: string) => void;

  // Filtering & sorting
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortConfig: SortConfig;
  setSortConfig: (config: SortConfig) => void;
  groupByTopic: boolean;
  setGroupByTopic: (value: boolean) => void;
  generatedFilter: GeneratedFilter;
  setGeneratedFilter: (filter: GeneratedFilter) => void;

  // Column visibility
  columnVisibility: ColumnVisibility;
  setColumnVisibility: (visibility: ColumnVisibility) => void;

  // Selection (from DatasetsUIContext)
  selectedRecordIds: Set<string>;
  setSelectedRecordIds: (ids: Set<string>) => void;

  // Dialog states
  deleteConfirm: DeleteConfirmation | null;
  setDeleteConfirm: (confirm: DeleteConfirmation | null) => void;
  assignTopicDialog: boolean;
  setAssignTopicDialog: (open: boolean) => void;
  importDialog: boolean;
  setImportDialog: (open: boolean) => void;
  createDatasetDialog: boolean;
  setCreateDatasetDialog: (open: boolean) => void;
  newDatasetName: string;
  setNewDatasetName: (name: string) => void;
  expandedRecord: DatasetRecord | null;
  setExpandedRecord: (record: DatasetRecord | null) => void;
  topicHierarchyDialog: boolean;
  setTopicHierarchyDialog: (open: boolean) => void;
  generateDataDialog: boolean;
  setGenerateDataDialog: (open: boolean) => void;

  // Loading states
  isGeneratingTopics: boolean;
  isGeneratingTraces: boolean;
  generationProgress: number | null; // Count of records generated so far
  isStartingFinetune: boolean;
  isGeneratingHierarchy: boolean;
  isAutoTagging: boolean;

  // Derived counts
  recordsWithTopicsCount: number;

  // Handlers
  loadDataset: () => Promise<void>;
  handleRenameDataset: (newName: string) => Promise<void>;
  handleDeleteRecord: (recordId: string) => Promise<void>;
  handleUpdateRecordTopic: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  handleUpdateRecordEvaluation: (recordId: string, score: number | undefined) => Promise<void>;
  handleDeleteConfirm: (confirmation: DeleteConfirmation) => void;
  handleBulkAssignTopic: (topic: string, isNew?: boolean) => Promise<void>;
  handleGenerateTopics: () => Promise<void>;
  handleGenerateTraces: (config?: GenerationConfig) => Promise<void>;
  handleBulkRunEvaluation: () => void;
  handleBulkDelete: () => Promise<void>;
  handleExport: () => void;
  handleStartFinetune: () => Promise<void>;
  handleImportRecords: (
    importedRecords: Array<{ data: unknown; topic?: string }>,
    mode: ImportMode,
    defaultTopic?: string
  ) => Promise<void>;
  handleSaveRecordData: (recordId: string, data: unknown) => Promise<void>;
  handleCreateDataset: () => Promise<void>;
  handleGenerateHierarchy: (goals: string, depth: number) => Promise<TopicHierarchyNode[]>;
  handleApplyTopicHierarchy: (config: TopicHierarchyConfig) => Promise<void>;
  handleAutoTagRecords: () => Promise<void>;
  handleClearRecordTopics: () => Promise<void>;
  handleRenameTopicInRecords: (oldName: string, newName: string) => Promise<void>;
  handleDeleteTopicFromRecords: (topicNames: string[]) => Promise<void>;
}
