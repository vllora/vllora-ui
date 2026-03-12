/**
 * DatasetsContext
 *
 * Manages dataset state across the application using Provider/Consumer pattern.
 * Single source of truth for all dataset-related data.
 */

import { createContext, useContext, useCallback, useState, useEffect, type ReactNode } from 'react';
import { Dataset, DatasetEvaluation, DatasetWithRecords } from '@/types/dataset-types';
import { Span } from '@/types/common-type';
import { datasetService, recordService, knowledgeSourceService, evalJobService, workflowService } from '@/services/service-registry';
import { clearProposedPlan } from '@/lib/distri-finetune-tools/steps/proposed-plan-store';
import { clearExecution } from '@/lib/distri-finetune-tools/steps/execution-state-store';
import { emitter } from '@/utils/eventEmitter';
import { toast } from 'sonner';

// ============================================================================
// Types - Auto-inferred from hook return type
// ============================================================================

export type DatasetsContextType = ReturnType<typeof useDatasets>;

// ============================================================================
// Context
// ============================================================================

const DatasetsContext = createContext<DatasetsContextType | undefined>(undefined);

// ============================================================================
// Hook - Core logic
// ============================================================================

function useDatasets() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load datasets from IndexedDB
  const loadDatasets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await datasetService.getAll();
      setDatasets(data);
    } catch (err) {
      console.error('Failed to load datasets:', err);
      const error = err instanceof Error ? err : new Error('Failed to load datasets');
      setError(error);
      setDatasets([]);
      toast.error('Failed to load workflows', {
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get a dataset with its records (fetches fresh from IndexedDB)
  const getDatasetWithRecords = useCallback(async (workflowId: string): Promise<DatasetWithRecords | null> => {
    try {
      // Fetch fresh dataset from IndexedDB to get latest data (including topicHierarchy)
      const dataset = await datasetService.getById(workflowId);
      if (!dataset) return null;

      const records = await recordService.getByDatasetId(workflowId);
      return { ...dataset, records };
    } catch (err) {
      console.error('Failed to get dataset with records:', err);
      return null;
    }
  }, []);

  // Get record count for a dataset
  const getRecordCount = useCallback(async (workflowId: string): Promise<number> => {
    try {
      return await recordService.getCount(workflowId);
    } catch (err) {
      console.error('Failed to get record count:', err);
      return 0;
    }
  }, []);

  // Get topic coverage stats for a dataset
  const getTopicCoverageStats = useCallback(async (workflowId: string): Promise<{ total: number; withTopic: number }> => {
    try {
      return await recordService.getTopicCoverageStats(workflowId);
    } catch (err) {
      console.error('Failed to get topic coverage stats:', err);
      return { total: 0, withTopic: 0 };
    }
  }, []);

  // Create a new dataset
  const createDataset = useCallback(async (name: string, datasetObjective?: string): Promise<Dataset> => {
    const newDataset = await datasetService.create(name, datasetObjective);
    setDatasets(prev => [newDataset, ...prev]);
    return newDataset;
  }, []);

  // Add spans to an existing dataset
  const addSpansToDataset = useCallback(async (
    workflowId: string,
    spans: Span[],
    topic?: string
  ): Promise<number> => {
    const addedCount = await recordService.addFromSpans(workflowId, spans, topic);
    // Refresh datasets to get updated timestamps
    await loadDatasets();
    return addedCount;
  }, [loadDatasets]);

  // Import raw records to an existing dataset (for file import)
  const importRecords = useCallback(async (
    workflowId: string,
    records: Array<{ data: unknown; topic?: string; evaluation?: DatasetEvaluation }>,
    defaultTopic?: string
  ): Promise<number> => {
    const addedRecords = await recordService.add(workflowId, records, defaultTopic);
    // Refresh datasets to get updated timestamps
    await loadDatasets();
    return addedRecords.length;
  }, [loadDatasets]);

  // Clear all records from a dataset (for replace import)
  const clearDatasetRecords = useCallback(async (workflowId: string): Promise<number> => {
    const deletedCount = await recordService.clearAll(workflowId);
    await loadDatasets();
    return deletedCount;
  }, [loadDatasets]);

  // Delete a dataset and all related data across all IndexedDB stores
  const deleteDataset = useCallback(async (workflowId: string): Promise<void> => {
    // Delete associated finetune workflow (includes snapshots and generation history)
    const workflow = await workflowService.getByDataset(workflowId);
    if (workflow) {
      await workflowService.delete(workflow.id);
    }

    // Clean up all related data in parallel
    await Promise.all([
      // Dataset + records + finetune job associations (vllora-datasets DB)
      datasetService.delete(workflowId),
      // Knowledge sources (vllora-knowledge-sources DB)
      knowledgeSourceService.deleteByDataset(workflowId),
      // Dry run / eval jobs
      evalJobService.deleteByDataset(workflowId),
      // Proposed plans (vllora-finetune DB)
      clearProposedPlan(workflowId),
    ]);

    // Clear in-memory execution state
    clearExecution(workflowId);

    setDatasets(prev => prev.filter(ds => ds.id !== workflowId));
  }, []);

  // Delete a single record from a dataset
  const deleteRecord = useCallback(async (workflowId: string, recordId: string): Promise<void> => {
    await recordService.delete(workflowId, recordId);
    // Refresh datasets to get updated timestamps
    await loadDatasets();
  }, [loadDatasets]);

  // Update a record's topic
  const updateRecordTopic = useCallback(async (
    workflowId: string,
    recordId: string,
    topic: string
  ): Promise<void> => {
    await recordService.updateTopic(workflowId, recordId, topic);
  }, []);

  // Update a record's data
  const updateRecordData = useCallback(async (
    workflowId: string,
    recordId: string,
    data: unknown
  ): Promise<void> => {
    await recordService.updateData(workflowId, recordId, data);
  }, []);

  // Update a record's evaluation
  const updateRecordEvaluation = useCallback(async (
    workflowId: string,
    recordId: string,
    score: number | undefined
  ): Promise<void> => {
    await recordService.updateEvaluation(workflowId, recordId, score);
  }, []);

  // Rename a dataset
  const renameDataset = useCallback(async (workflowId: string, newName: string): Promise<void> => {
    await datasetService.rename(workflowId, newName);
    setDatasets(prev => prev.map(ds =>
      ds.id === workflowId ? { ...ds, name: newName.trim(), updatedAt: Date.now() } : ds
    ));
  }, []);

  // Check if span already exists in dataset
  const spanExistsInDataset = useCallback(async (
    workflowId: string,
    spanId: string
  ): Promise<boolean> => {
    return await recordService.spanExists(workflowId, spanId);
  }, []);

  // Get all datasets that contain a specific span
  const getDatasetsBySpanId = useCallback(async (spanId: string): Promise<Dataset[]> => {
    try {
      return await recordService.getDatasetsBySpanId(spanId);
    } catch (err) {
      console.error('Failed to get datasets by span id:', err);
      return [];
    }
  }, []);

  // Load on mount + clean up any orphaned data from past incomplete deletes
  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  // Listen for dataset events from Lucy agent tools
  useEffect(() => {
    const handleDatasetCreated = (data: { dataset: Dataset }) => {
      if (data.dataset) {
        setDatasets(prev => {
          // Avoid duplicates
          if (prev.some(d => d.id === data.dataset.id)) return prev;
          return [data.dataset, ...prev];
        });
      }
    };

    const handleDatasetDeleted = (data: { workflowId: string }) => {
      if (data.workflowId) {
        setDatasets(prev => prev.filter(d => d.id !== data.workflowId));
      }
    };

    const handleDatasetRenamed = (data: { workflowId: string; name: string }) => {
      if (data.workflowId && data.name) {
        setDatasets(prev => prev.map(d =>
          d.id === data.workflowId ? { ...d, name: data.name, updatedAt: Date.now() } : d
        ));
      }
    };

    const handleDatasetRefresh = () => {
      loadDatasets();
    };

    emitter.on('vllora_dataset_created' as any, handleDatasetCreated);
    emitter.on('vllora_dataset_deleted' as any, handleDatasetDeleted);
    emitter.on('vllora_dataset_renamed' as any, handleDatasetRenamed);
    emitter.on('vllora_dataset_refresh' as any, handleDatasetRefresh);

    return () => {
      emitter.off('vllora_dataset_created' as any, handleDatasetCreated);
      emitter.off('vllora_dataset_deleted' as any, handleDatasetDeleted);
      emitter.off('vllora_dataset_renamed' as any, handleDatasetRenamed);
      emitter.off('vllora_dataset_refresh' as any, handleDatasetRefresh);
    };
  }, [loadDatasets]);

  return {
    datasets,
    isLoading,
    error,
    loadDatasets,
    getDatasetWithRecords,
    getRecordCount,
    getTopicCoverageStats,
    createDataset,
    addSpansToDataset,
    importRecords,
    clearDatasetRecords,
    deleteDataset,
    deleteRecord,
    updateRecordTopic,
    updateRecordData,
    updateRecordEvaluation,
    renameDataset,
    spanExistsInDataset,
    getDatasetsBySpanId,
  };
}

// ============================================================================
// Provider
// ============================================================================

export function DatasetsProvider({ children }: { children: ReactNode }) {
  const value = useDatasets();
  return <DatasetsContext.Provider value={value}>{children}</DatasetsContext.Provider>;
}

// ============================================================================
// Consumer
// ============================================================================

export function DatasetsConsumer() {
  const context = useContext(DatasetsContext);
  if (context === undefined) {
    throw new Error('DatasetsConsumer must be used within a DatasetsProvider');
  }
  return context;
}

/** Optional consumer that returns null if not inside DatasetsProvider */
export function useDatasetsOptional() {
  return useContext(DatasetsContext) ?? null;
}
