/**
 * DatasetsContext
 *
 * Manages dataset state across the application using Provider/Consumer pattern.
 * Single source of truth for all dataset-related data.
 */

import { createContext, useContext, ReactNode, useCallback, useState, useEffect } from 'react';
import { Dataset, DatasetWithRecords } from '@/types/dataset-types';
import { Span } from '@/types/common-type';
import * as datasetsDB from '@/services/datasets-db';
import { emitter } from '@/utils/eventEmitter';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

interface DatasetsContextType {
  // State
  datasets: Dataset[];
  isLoading: boolean;
  error: Error | null;

  // Actions
  loadDatasets: () => Promise<void>;
  getDatasetWithRecords: (datasetId: string) => Promise<DatasetWithRecords | null>;
  getRecordCount: (datasetId: string) => Promise<number>;
  createDataset: (name: string) => Promise<Dataset>;
  addSpansToDataset: (datasetId: string, spans: Span[], topic?: string) => Promise<number>;
  deleteDataset: (datasetId: string) => Promise<void>;
  deleteRecord: (datasetId: string, recordId: string) => Promise<void>;
  updateRecordTopic: (datasetId: string, recordId: string, topic: string) => Promise<void>;
  updateRecordData: (datasetId: string, recordId: string, data: unknown) => Promise<void>;
  renameDataset: (datasetId: string, newName: string) => Promise<void>;
  spanExistsInDataset: (datasetId: string, spanId: string) => Promise<boolean>;
  getDatasetsBySpanId: (spanId: string) => Promise<Dataset[]>;
}

// ============================================================================
// Context
// ============================================================================

const DatasetsContext = createContext<DatasetsContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

export function DatasetsProvider({ children }: { children: ReactNode }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load datasets from IndexedDB
  const loadDatasets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await datasetsDB.getAllDatasets();
      setDatasets(data);
    } catch (err) {
      console.error('Failed to load datasets:', err);
      const error = err instanceof Error ? err : new Error('Failed to load datasets');
      setError(error);
      setDatasets([]);
      toast.error('Failed to load datasets', {
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get a dataset with its records
  const getDatasetWithRecords = useCallback(async (datasetId: string): Promise<DatasetWithRecords | null> => {
    try {
      const dataset = datasets.find(ds => ds.id === datasetId);
      if (!dataset) return null;

      const records = await datasetsDB.getRecordsByDatasetId(datasetId);
      return { ...dataset, records };
    } catch (err) {
      console.error('Failed to get dataset with records:', err);
      return null;
    }
  }, [datasets]);

  // Get record count for a dataset
  const getRecordCount = useCallback(async (datasetId: string): Promise<number> => {
    try {
      return await datasetsDB.getRecordCount(datasetId);
    } catch (err) {
      console.error('Failed to get record count:', err);
      return 0;
    }
  }, []);

  // Create a new dataset
  const createDataset = useCallback(async (name: string): Promise<Dataset> => {
    const newDataset = await datasetsDB.createDataset(name);
    setDatasets(prev => [newDataset, ...prev]);
    return newDataset;
  }, []);

  // Add spans to an existing dataset
  const addSpansToDataset = useCallback(async (
    datasetId: string,
    spans: Span[],
    topic?: string
  ): Promise<number> => {
    const addedCount = await datasetsDB.addSpansToDataset(datasetId, spans, topic);
    // Refresh datasets to get updated timestamps
    await loadDatasets();
    return addedCount;
  }, [loadDatasets]);

  // Delete a dataset
  const deleteDataset = useCallback(async (datasetId: string): Promise<void> => {
    await datasetsDB.deleteDataset(datasetId);
    setDatasets(prev => prev.filter(ds => ds.id !== datasetId));
  }, []);

  // Delete a single record from a dataset
  const deleteRecord = useCallback(async (datasetId: string, recordId: string): Promise<void> => {
    await datasetsDB.deleteRecord(datasetId, recordId);
    // Refresh datasets to get updated timestamps
    await loadDatasets();
  }, [loadDatasets]);

  // Update a record's topic
  const updateRecordTopic = useCallback(async (
    datasetId: string,
    recordId: string,
    topic: string
  ): Promise<void> => {
    await datasetsDB.updateRecordTopic(datasetId, recordId, topic);
  }, []);

  // Update a record's data
  const updateRecordData = useCallback(async (
    datasetId: string,
    recordId: string,
    data: unknown
  ): Promise<void> => {
    await datasetsDB.updateRecordData(datasetId, recordId, data);
  }, []);

  // Rename a dataset
  const renameDataset = useCallback(async (datasetId: string, newName: string): Promise<void> => {
    await datasetsDB.renameDataset(datasetId, newName);
    setDatasets(prev => prev.map(ds =>
      ds.id === datasetId ? { ...ds, name: newName.trim(), updatedAt: Date.now() } : ds
    ));
  }, []);

  // Check if span already exists in dataset
  const spanExistsInDataset = useCallback(async (
    datasetId: string,
    spanId: string
  ): Promise<boolean> => {
    return await datasetsDB.spanExistsInDataset(datasetId, spanId);
  }, []);

  // Get all datasets that contain a specific span
  const getDatasetsBySpanId = useCallback(async (spanId: string): Promise<Dataset[]> => {
    try {
      return await datasetsDB.getDatasetsBySpanId(spanId);
    } catch (err) {
      console.error('Failed to get datasets by span id:', err);
      return [];
    }
  }, []);

  // Load on mount
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

    const handleDatasetDeleted = (data: { datasetId: string }) => {
      if (data.datasetId) {
        setDatasets(prev => prev.filter(d => d.id !== data.datasetId));
      }
    };

    const handleDatasetRenamed = (data: { datasetId: string; name: string }) => {
      if (data.datasetId && data.name) {
        setDatasets(prev => prev.map(d =>
          d.id === data.datasetId ? { ...d, name: data.name, updatedAt: Date.now() } : d
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

  const value: DatasetsContextType = {
    datasets,
    isLoading,
    error,
    loadDatasets,
    getDatasetWithRecords,
    getRecordCount,
    createDataset,
    addSpansToDataset,
    deleteDataset,
    deleteRecord,
    updateRecordTopic,
    updateRecordData,
    renameDataset,
    spanExistsInDataset,
    getDatasetsBySpanId,
  };

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
