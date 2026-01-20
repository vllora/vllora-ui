/**
 * DatasetDetailContext
 *
 * Manages state for the dataset detail view using Provider/Consumer pattern.
 * Reduces prop drilling by providing state and handlers to child components.
 */

import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import { DatasetsUIConsumer } from "@/contexts/DatasetsUIContext";
import { Dataset, DatasetRecord, TopicHierarchyConfig, TopicHierarchyNode } from "@/types/dataset-types";
import { emitter } from "@/utils/eventEmitter";
import { toast } from "sonner";
import { uploadDatasetForFinetune, createFinetuneJobFromUpload } from "@/services/finetune-api";
import { updateDatasetBackendId, updateDatasetTopicHierarchy, clearAllRecordTopics, updateRecordTopicsBatch } from "@/services/datasets-db";
import { filterAndSortRecords } from "@/components/datasets/record-filters";
import {
  ColumnVisibility,
  DEFAULT_COLUMN_VISIBILITY,
  COLUMN_VISIBILITY_STORAGE_KEY,
} from "@/components/datasets/table-columns";
import type { SortConfig } from "@/components/datasets/RecordsToolbar";
import type { ImportMode } from "@/components/datasets/IngestDataDialog";
import type { DeleteConfirmation } from "@/components/datasets/DeleteConfirmationDialog";
import type { GenerationConfig } from "@/components/datasets/GenerateSyntheticDataDialog";
import { generateTopics } from "@/lib/distri-dataset-tools/analysis/generate-topics";
import { generateTraces } from "@/lib/distri-dataset-tools/analysis/generate-traces";
import { generateHierarchy } from "@/lib/distri-dataset-tools/analysis/generate-hierarchy";
import { classifyRecords } from "@/lib/distri-dataset-tools/analysis/classify-records";

// ============================================================================
// Types
// ============================================================================

type GeneratedFilter = "all" | "generated" | "not_generated";

interface DatasetDetailContextType {
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
  handleBulkAssignTopic: (topic: string) => Promise<void>;
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
}

// ============================================================================
// Context
// ============================================================================

const DatasetDetailContext = createContext<DatasetDetailContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface DatasetDetailProviderProps {
  children: ReactNode;
  datasetId: string;
  onBack: () => void;
  onSelectDataset?: (datasetId: string) => void;
}

export function DatasetDetailProvider({
  children,
  datasetId,
  onBack,
  onSelectDataset,
}: DatasetDetailProviderProps) {
  // Get datasets context
  const {
    datasets,
    getDatasetWithRecords,
    getRecordCount,
    createDataset,
    deleteDataset,
    deleteRecord,
    updateRecordTopic,
    updateRecordData,
    updateRecordEvaluation,
    renameDataset,
    importRecords,
    clearDatasetRecords,
  } = DatasetsConsumer();

  // Get selection state from UI context
  const { selectedRecordIds, setSelectedRecordIds } = DatasetsUIConsumer();

  // Core state
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [records, setRecords] = useState<DatasetRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [datasetRecordCounts, setDatasetRecordCounts] = useState<Record<string, number>>({});

  // Filtering & sorting state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: "timestamp",
    direction: "desc",
  });
  const [groupByTopic, setGroupByTopic] = useState(false);
  const [generatedFilter, setGeneratedFilter] = useState<GeneratedFilter>("all");

  // Column visibility with localStorage persistence
  const [columnVisibility, setColumnVisibilityState] = useState<ColumnVisibility>(() => {
    try {
      const stored = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_COLUMN_VISIBILITY, ...JSON.parse(stored) };
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_COLUMN_VISIBILITY;
  });

  const setColumnVisibility = useCallback((visibility: ColumnVisibility) => {
    setColumnVisibilityState(visibility);
    try {
      localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(visibility));
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Dialog states
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmation | null>(null);
  const [assignTopicDialog, setAssignTopicDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [createDatasetDialog, setCreateDatasetDialog] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState("");
  const [expandedRecord, setExpandedRecord] = useState<DatasetRecord | null>(null);
  const [topicHierarchyDialog, setTopicHierarchyDialog] = useState(false);
  const [generateDataDialog, setGenerateDataDialog] = useState(false);

  // Loading states
  const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
  const [isGeneratingTraces, setIsGeneratingTraces] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<number | null>(null);
  const [isStartingFinetune, setIsStartingFinetune] = useState(false);
  const [isGeneratingHierarchy, setIsGeneratingHierarchy] = useState(false);
  const [isAutoTagging, setIsAutoTagging] = useState(false);

  // Derived state: filtered and sorted records
  const sortedRecords = useMemo(
    () =>
      filterAndSortRecords(
        records,
        { search: searchQuery, generated: generatedFilter },
        { field: sortConfig.field, direction: sortConfig.direction }
      ),
    [records, searchQuery, generatedFilter, sortConfig]
  );

  // Load dataset and records
  const loadDataset = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getDatasetWithRecords(datasetId);
      if (result) {
        setDataset(result);
        setRecords(result.records);
      }
    } catch (err) {
      console.error("Failed to load dataset:", err);
      toast.error("Failed to load dataset");
    } finally {
      setIsLoading(false);
    }
  }, [datasetId, getDatasetWithRecords]);

  // Initial load
  useEffect(() => {
    loadDataset();
  }, [loadDataset]);

  // Listen for dataset refresh events
  useEffect(() => {
    const handleRefresh = () => loadDataset();
    emitter.on("vllora_dataset_refresh" as any, handleRefresh);
    return () => {
      emitter.off("vllora_dataset_refresh" as any, handleRefresh);
    };
  }, [loadDataset]);

  // Listen for records deleted events
  useEffect(() => {
    const handleRecordsDeleted = (data: { datasetId: string; recordIds: string[] }) => {
      if (data.datasetId !== datasetId) return;
      const deletedSet = new Set(data.recordIds);
      setRecords((prev) => prev.filter((r) => !deletedSet.has(r.id)));
      const newSelection = new Set(selectedRecordIds);
      data.recordIds.forEach((id) => newSelection.delete(id));
      setSelectedRecordIds(newSelection);
      toast.success(`Deleted ${data.recordIds.length} record${data.recordIds.length !== 1 ? "s" : ""}`);
    };
    emitter.on("vllora_dataset_records_deleted" as any, handleRecordsDeleted);
    return () => {
      emitter.off("vllora_dataset_records_deleted" as any, handleRecordsDeleted);
    };
  }, [datasetId, selectedRecordIds, setSelectedRecordIds]);

  // Update dataset from context when it changes
  useEffect(() => {
    const updated = datasets.find((d) => d.id === datasetId);
    if (updated && dataset) {
      setDataset(updated);
    }
  }, [datasets, datasetId, dataset]);

  // Load record counts for dropdown
  useEffect(() => {
    const loadCounts = async () => {
      const counts: Record<string, number> = {};
      counts[datasetId] = records.length;
      for (const ds of datasets) {
        if (ds.id !== datasetId) {
          counts[ds.id] = await getRecordCount(ds.id);
        }
      }
      setDatasetRecordCounts(counts);
    };
    if (datasets.length > 1) {
      loadCounts();
    }
  }, [datasets, datasetId, records.length, getRecordCount]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleRenameDataset = useCallback(
    async (newName: string) => {
      if (!dataset) return;
      try {
        await renameDataset(dataset.id, newName);
        setDataset({ ...dataset, name: newName });
        toast.success("Dataset renamed");
      } catch {
        toast.error("Failed to rename dataset");
      }
    },
    [dataset, renameDataset]
  );

  const handleDeleteDataset = useCallback(async () => {
    if (!dataset) return;
    try {
      await deleteDataset(dataset.id);
      toast.success("Dataset deleted");
      onBack();
    } catch {
      toast.error("Failed to delete dataset");
    }
  }, [dataset, deleteDataset, onBack]);

  const handleDeleteRecord = useCallback(
    async (recordId: string) => {
      if (!dataset) return;
      try {
        await deleteRecord(dataset.id, recordId);
        setRecords((prev) => prev.filter((r) => r.id !== recordId));
        const newSelection = new Set(selectedRecordIds);
        newSelection.delete(recordId);
        setSelectedRecordIds(newSelection);
        toast.success("Record deleted");
      } catch {
        toast.error("Failed to delete record");
      }
    },
    [dataset, deleteRecord, selectedRecordIds, setSelectedRecordIds]
  );

  const handleUpdateRecordTopic = useCallback(
    async (recordId: string, topic: string, isNew?: boolean) => {
      if (!dataset) return;
      try {
        await updateRecordTopic(dataset.id, recordId, topic);
        const now = Date.now();
        setRecords((prev) =>
          prev.map((r) =>
            r.id === recordId ? { ...r, topic: topic.trim() || undefined, updatedAt: now } : r
          )
        );
        if (expandedRecord?.id === recordId) {
          setExpandedRecord((prev) =>
            prev ? { ...prev, topic: topic.trim() || undefined, updatedAt: now } : null
          );
        }

        // If this is a new topic and we have a hierarchy, add it to the hierarchy
        if (isNew && topic.trim() && dataset.topicHierarchy) {
          const newNode: TopicHierarchyNode = {
            id: crypto.randomUUID(),
            name: topic.trim(),
            children: [],
          };
          const updatedHierarchy = [
            ...(dataset.topicHierarchy.hierarchy || []),
            newNode,
          ];
          const updatedConfig: TopicHierarchyConfig = {
            ...dataset.topicHierarchy,
            hierarchy: updatedHierarchy,
          };
          await updateDatasetTopicHierarchy(dataset.id, updatedConfig);
          setDataset((prev) =>
            prev ? { ...prev, topicHierarchy: updatedConfig } : null
          );
          toast.success(`Topic "${topic.trim()}" added to hierarchy`);
        } else {
          toast.success("Topic updated");
        }
      } catch {
        toast.error("Failed to update topic");
      }
    },
    [dataset, updateRecordTopic, expandedRecord]
  );

  const handleUpdateRecordEvaluation = useCallback(
    async (recordId: string, score: number | undefined) => {
      if (!dataset) return;
      try {
        await updateRecordEvaluation(dataset.id, recordId, score);
        const now = Date.now();
        const newEvaluation = score === undefined ? undefined : { score, evaluatedAt: now };
        setRecords((prev) =>
          prev.map((r) =>
            r.id === recordId ? { ...r, evaluation: newEvaluation, updatedAt: now } : r
          )
        );
        if (expandedRecord?.id === recordId) {
          setExpandedRecord((prev) =>
            prev ? { ...prev, evaluation: newEvaluation, updatedAt: now } : null
          );
        }
        toast.success(score === undefined ? "Evaluation cleared" : `Rated ${score}/5`);
      } catch {
        toast.error("Failed to update evaluation");
      }
    },
    [dataset, updateRecordEvaluation, expandedRecord]
  );

  const handleDeleteConfirmHandler = useCallback(
    (confirmation: DeleteConfirmation) => {
      if (confirmation.type === "dataset") {
        handleDeleteDataset();
      } else if (confirmation.type === "record") {
        handleDeleteRecord(confirmation.id);
      }
      setDeleteConfirm(null);
    },
    [handleDeleteDataset, handleDeleteRecord]
  );

  const handleBulkAssignTopic = useCallback(
    async (topic: string) => {
      if (!dataset) return;
      const idsToProcess = Array.from(selectedRecordIds);
      let successCount = 0;
      for (const recordId of idsToProcess) {
        try {
          await updateRecordTopic(dataset.id, recordId, topic);
          successCount++;
        } catch {
          // Continue with other records
        }
      }
      if (successCount > 0) {
        const now = Date.now();
        setRecords((prev) =>
          prev.map((r) => (selectedRecordIds.has(r.id) ? { ...r, topic, updatedAt: now } : r))
        );
        toast.success(`Assigned topic to ${successCount} record${successCount !== 1 ? "s" : ""}`);
      }
      setAssignTopicDialog(false);
      setSelectedRecordIds(new Set());
    },
    [dataset, selectedRecordIds, updateRecordTopic, setSelectedRecordIds]
  );

  const handleGenerateTopics = useCallback(async () => {
    if (!dataset) return;
    const recordIds = Array.from(selectedRecordIds);
    if (recordIds.length === 0) return;

    setIsGeneratingTopics(true);
    try {
      const result = await generateTopics({
        datasetId: dataset.id,
        recordIds,
        maxTopics: 3,
        maxDepth: 3,
        degree: 2,
      });
      if (result.success) {
        toast.success("Topics generated and applied to selected records");
        await loadDataset();
        setSelectedRecordIds(new Set());
      } else {
        toast.error(result.error || "Failed to generate topics");
      }
    } catch (err) {
      console.error("Failed to generate topics", err);
      toast.error("Failed to generate topics");
    } finally {
      setIsGeneratingTopics(false);
    }
  }, [dataset, selectedRecordIds, loadDataset, setSelectedRecordIds]);

  const handleGenerateTraces = useCallback(async (config?: GenerationConfig) => {
    if (!dataset) return;
    const recordIds = Array.from(selectedRecordIds);

    // Use config values or defaults
    const count = config?.recordsPerTopic ?? 5;
    const targetTopics = config?.targetTopics ?? 'all';
    const selectedTopicsList = config?.selectedTopics ?? [];

    // Close dialog immediately and show starting toast
    setGenerateDataDialog(false);
    toast.info(`Starting generation of ${count} records...`);

    setIsGeneratingTraces(true);
    setGenerationProgress(0);

    try {
      const result = await generateTraces({
        dataset_id: dataset.id,
        record_ids: recordIds.length > 0 ? recordIds : undefined,
        count,
        max_turns: 3,
        concurrency: 5, // Run 5 generations in parallel
        target_topics: targetTopics,
        selected_topics: selectedTopicsList,
        on_records_added: (newRecords: DatasetRecord[]) => {
          // Instantly append new records to state for immediate UI update
          setRecords((prev) => [...prev, ...newRecords]);
        },
        on_progress: (progress: { completed: number; total: number }) => {
          // Update progress count in real-time
          setGenerationProgress(progress.completed);
        },
      });

      if (result.success) {
        const generatedCount = result.created_count ?? 0;
        setGenerationProgress(generatedCount);
        toast.success(
          `Generated ${generatedCount} synthetic record${generatedCount === 1 ? "" : "s"}`
        );
      } else {
        toast.error(result.error || "Failed to generate traces");
      }
    } catch (err) {
      console.error("Failed to generate traces", err);
      toast.error("Failed to generate traces");
    } finally {
      setIsGeneratingTraces(false);
      setGenerationProgress(null);
    }
  }, [dataset, selectedRecordIds]);

  const handleBulkRunEvaluation = useCallback(() => {
    toast.info("Run evaluation feature coming soon");
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (!dataset) return;
    const idsToProcess = Array.from(selectedRecordIds);
    let successCount = 0;
    for (const recordId of idsToProcess) {
      try {
        await deleteRecord(dataset.id, recordId);
        successCount++;
      } catch {
        // Continue with other records
      }
    }
    if (successCount > 0) {
      setRecords((prev) => prev.filter((r) => !selectedRecordIds.has(r.id)));
      toast.success(`Deleted ${successCount} record${successCount !== 1 ? "s" : ""}`);
    }
    setSelectedRecordIds(new Set());
  }, [dataset, selectedRecordIds, deleteRecord, setSelectedRecordIds]);

  const handleExport = useCallback(() => {
    if (!dataset) return;
    const exportData = {
      name: dataset.name,
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
      records: records,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dataset.name.toLowerCase().replace(/\s+/g, "-")}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Dataset exported");
  }, [dataset, records]);

  const handleStartFinetune = useCallback(async () => {
    if (!dataset || records.length === 0 || isStartingFinetune) return;

    setIsStartingFinetune(true);
    try {
      let backendDatasetId = dataset.backendDatasetId;

      // Step 1: Upload dataset to backend (skip if already uploaded)
      if (!backendDatasetId) {
        const uploadResult = await uploadDatasetForFinetune({ ...dataset, records });
        backendDatasetId = uploadResult.backendDatasetId;

        // Save the backend dataset ID immediately after upload succeeds
        // This ensures we track the uploaded dataset even if job creation fails
        await updateDatasetBackendId(dataset.id, backendDatasetId);
        setDataset((prev) => prev ? { ...prev, backendDatasetId } : null);
      }

      // Step 2: Create the finetune job
      const job = await createFinetuneJobFromUpload(backendDatasetId, dataset.name);

      toast.success("Fine-tuning job started", {
        description: `Job ID: ${job.id}`,
      });
      // Emit event to notify FinetuneJobsContext to refresh
      emitter.emit("vllora_finetune_job_created", { jobId: job.id });
    } catch (err) {
      console.error("Failed to start fine-tuning job:", err);
      toast.error("Failed to start fine-tuning job", {
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setIsStartingFinetune(false);
    }
  }, [dataset, records, isStartingFinetune]);

  const handleImportRecords = useCallback(
    async (
      importedRecords: Array<{ data: unknown; topic?: string }>,
      mode: ImportMode,
      defaultTopic?: string
    ) => {
      if (!dataset) return;
      if (mode === "replace" && records.length > 0) {
        await clearDatasetRecords(dataset.id);
        setSelectedRecordIds(new Set());
      }
      const count = await importRecords(dataset.id, importedRecords, defaultTopic);
      await loadDataset();
      if (mode === "replace") {
        toast.success(`Replaced dataset with ${count} record${count !== 1 ? "s" : ""}`);
      } else {
        toast.success(`Imported ${count} record${count !== 1 ? "s" : ""}`);
      }
    },
    [dataset, records.length, clearDatasetRecords, importRecords, loadDataset, setSelectedRecordIds]
  );

  const handleSaveRecordData = useCallback(
    async (recordId: string, data: unknown) => {
      if (!dataset) return;
      await updateRecordData(dataset.id, recordId, data);
      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? { ...r, data, updatedAt: Date.now() } : r))
      );
      toast.success("Record data updated");
      setExpandedRecord(null);
    },
    [dataset, updateRecordData]
  );

  const handleCreateDataset = useCallback(async () => {
    if (!newDatasetName.trim()) return;
    try {
      const newDs = await createDataset(newDatasetName.trim());
      setCreateDatasetDialog(false);
      setNewDatasetName("");
      toast.success("Dataset created");
      onSelectDataset?.(newDs.id);
    } catch {
      toast.error("Failed to create dataset");
    }
  }, [newDatasetName, createDataset, onSelectDataset]);

  const handleGenerateHierarchy = useCallback(
    async (goals: string, depth: number): Promise<TopicHierarchyNode[]> => {
      if (!dataset) return [];
      setIsGeneratingHierarchy(true);
      try {
        const result = await generateHierarchy({
          goals,
          depth,
          records,
        });

        if (!result.success || !result.hierarchy) {
          toast.error(result.error || "Failed to generate hierarchy");
          return [];
        }

        return result.hierarchy;
      } catch (err) {
        console.error("Failed to generate hierarchy:", err);
        toast.error("Failed to generate hierarchy");
        return [];
      } finally {
        setIsGeneratingHierarchy(false);
      }
    },
    [dataset, records]
  );

  const handleApplyTopicHierarchy = useCallback(
    async (config: TopicHierarchyConfig) => {
      if (!dataset) return;
      try {
        await updateDatasetTopicHierarchy(dataset.id, config);
        setDataset((prev) => (prev ? { ...prev, topicHierarchy: config } : null));
        // Dialog shows its own "Saved" indicator - no toast or auto-close needed
      } catch (err) {
        console.error("Failed to save topic hierarchy:", err);
        toast.error("Failed to save topic hierarchy");
      }
    },
    [dataset]
  );

  const handleAutoTagRecords = useCallback(async () => {
    if (!dataset || !dataset.topicHierarchy?.hierarchy) {
      toast.error("No topic hierarchy configured");
      return;
    }

    const recordsToTag = selectedRecordIds.size > 0
      ? records.filter(r => selectedRecordIds.has(r.id))
      : records;

    if (recordsToTag.length === 0) {
      toast.error("No records to tag");
      return;
    }

    setIsAutoTagging(true);
    try {
      const result = await classifyRecords({
        hierarchy: dataset.topicHierarchy.hierarchy,
        records: recordsToTag,
      });

      if (!result.success || !result.classifications) {
        toast.error(result.error || "Failed to classify records");
        return;
      }

      // Batch update all records' topics in a single transaction
      const updatedCount = await updateRecordTopicsBatch(dataset.id, result.classifications);

      // Refresh records
      await loadDataset();
      toast.success(`Tagged ${updatedCount} record${updatedCount !== 1 ? 's' : ''}`);
    } catch (err) {
      console.error("Failed to auto-tag records:", err);
      toast.error("Failed to auto-tag records");
    } finally {
      setIsAutoTagging(false);
    }
  }, [dataset, records, selectedRecordIds, loadDataset]);

  const handleClearRecordTopics = useCallback(async () => {
    if (!dataset) return;
    try {
      const clearedCount = await clearAllRecordTopics(dataset.id);
      // Update local state to reflect cleared topics
      setRecords((prev) =>
        prev.map((r) => (r.topic ? { ...r, topic: undefined, updatedAt: Date.now() } : r))
      );
      if (clearedCount > 0) {
        toast.success(`Cleared topics from ${clearedCount} record${clearedCount !== 1 ? "s" : ""}`);
      }
    } catch (err) {
      console.error("Failed to clear record topics:", err);
      toast.error("Failed to clear record topics");
    }
  }, [dataset]);

  // Derived: count of records that have topics assigned
  const recordsWithTopicsCount = useMemo(
    () => records.filter((r) => r.topic).length,
    [records]
  );

  // ============================================================================
  // Context value
  // ============================================================================

  const value: DatasetDetailContextType = {
    // Core data
    dataset,
    records,
    sortedRecords,
    isLoading,
    datasetId,

    // Navigation
    datasets,
    datasetRecordCounts,
    onBack,
    onSelectDataset,

    // Filtering & sorting
    searchQuery,
    setSearchQuery,
    sortConfig,
    setSortConfig,
    groupByTopic,
    setGroupByTopic,
    generatedFilter,
    setGeneratedFilter,

    // Column visibility
    columnVisibility,
    setColumnVisibility,

    // Selection
    selectedRecordIds,
    setSelectedRecordIds,

    // Dialog states
    deleteConfirm,
    setDeleteConfirm,
    assignTopicDialog,
    setAssignTopicDialog,
    importDialog,
    setImportDialog,
    createDatasetDialog,
    setCreateDatasetDialog,
    newDatasetName,
    setNewDatasetName,
    expandedRecord,
    setExpandedRecord,
    topicHierarchyDialog,
    setTopicHierarchyDialog,
    generateDataDialog,
    setGenerateDataDialog,

    // Loading states
    isGeneratingTopics,
    isGeneratingTraces,
    generationProgress,
    isStartingFinetune,
    isGeneratingHierarchy,
    isAutoTagging,

    // Derived counts
    recordsWithTopicsCount,

    // Handlers
    loadDataset,
    handleRenameDataset,
    handleDeleteRecord,
    handleUpdateRecordTopic,
    handleUpdateRecordEvaluation,
    handleDeleteConfirm: handleDeleteConfirmHandler,
    handleBulkAssignTopic,
    handleGenerateTopics,
    handleGenerateTraces,
    handleBulkRunEvaluation,
    handleBulkDelete,
    handleExport,
    handleStartFinetune,
    handleImportRecords,
    handleSaveRecordData,
    handleCreateDataset,
    handleGenerateHierarchy,
    handleApplyTopicHierarchy,
    handleAutoTagRecords,
    handleClearRecordTopics,
  };

  return <DatasetDetailContext.Provider value={value}>{children}</DatasetDetailContext.Provider>;
}

// ============================================================================
// Consumer
// ============================================================================

export function DatasetDetailConsumer() {
  const context = useContext(DatasetDetailContext);
  if (context === undefined) {
    throw new Error("DatasetDetailConsumer must be used within a DatasetDetailProvider");
  }
  return context;
}
