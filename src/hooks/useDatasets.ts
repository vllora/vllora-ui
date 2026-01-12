import { useState, useCallback, useEffect } from 'react';
import { Dataset, DatasetWithRecords } from '@/types/dataset-types';
import { Span } from '@/types/common-type';
import * as datasetsDB from '@/services/datasets-db';

export function useDatasets() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load datasets from IndexedDB on mount
  const loadDatasets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await datasetsDB.getAllDatasets();
      setDatasets(data);
    } catch (err) {
      console.error('Failed to load datasets:', err);
      setError(err instanceof Error ? err : new Error('Failed to load datasets'));
      setDatasets([]);
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

  // Load on mount
  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  return {
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
    renameDataset,
    spanExistsInDataset,
  };
}
