/**
 * DatasetsListView
 *
 * Displays the list of all datasets with expandable records preview.
 */

import { useState, useMemo, useEffect } from "react";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import { DatasetRecord } from "@/types/dataset-types";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DeleteConfirmationDialog,
  type DeleteConfirmation,
} from "./DeleteConfirmationDialog";
import { DatasetItem } from "./DatasetItem";
import { DatasetsEmptyState } from "./DatasetsEmptyState";
import { DatasetsListHeader } from "./DatasetsListHeader";
import { DatasetsNoResultsState } from "./DatasetsNoResultsState";
import { IngestDataDialog, type ImportResult } from "./IngestDataDialog";

interface DatasetsListViewProps {
  onSelectDataset: (datasetId: string) => void;
}

export function DatasetsListView({ onSelectDataset }: DatasetsListViewProps) {
  const {
    datasets,
    isLoading,
    error,
    getDatasetWithRecords,
    getRecordCount,
    createDataset,
    deleteDataset,
    deleteRecord,
    updateRecordTopic,
    renameDataset,
    importRecords,
    clearDatasetRecords,
  } = DatasetsConsumer();

  // State
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set());
  const [datasetRecords, setDatasetRecords] = useState<Record<string, DatasetRecord[]>>({});
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});
  const [loadingRecords, setLoadingRecords] = useState<Set<string>>(new Set());
  const [editingDatasetId, setEditingDatasetId] = useState<string | null>(null);
  const [editingDatasetName, setEditingDatasetName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Max records to show before "See all" link
  const MAX_VISIBLE_RECORDS = 5;

  // Filter datasets by search query
  const filteredDatasets = useMemo(() => {
    if (!searchQuery.trim()) return datasets;
    const query = searchQuery.toLowerCase();
    return datasets.filter(ds => ds.name.toLowerCase().includes(query));
  }, [datasets, searchQuery]);

  // Load record counts for all datasets
  useEffect(() => {
    const loadCounts = async () => {
      const counts: Record<string, number> = {};
      await Promise.all(
        datasets.map(async (ds) => {
          counts[ds.id] = await getRecordCount(ds.id);
        })
      );
      setRecordCounts(counts);
    };
    if (datasets.length > 0) {
      loadCounts();
    }
  }, [datasets, getRecordCount]);

  // Handlers
  const toggleDataset = async (datasetId: string) => {
    const newExpanded = new Set(expandedDatasets);
    if (newExpanded.has(datasetId)) {
      newExpanded.delete(datasetId);
    } else {
      newExpanded.add(datasetId);
      if (!datasetRecords[datasetId] && !loadingRecords.has(datasetId)) {
        setLoadingRecords(prev => new Set(prev).add(datasetId));
        const datasetWithRecords = await getDatasetWithRecords(datasetId);
        if (datasetWithRecords) {
          setDatasetRecords(prev => ({ ...prev, [datasetId]: datasetWithRecords.records }));
        }
        setLoadingRecords(prev => {
          const newSet = new Set(prev);
          newSet.delete(datasetId);
          return newSet;
        });
      }
    }
    setExpandedDatasets(newExpanded);
  };

  const handleRenameDataset = async (datasetId: string) => {
    if (!editingDatasetName.trim()) {
      toast.error("Dataset name cannot be empty");
      return;
    }
    try {
      await renameDataset(datasetId, editingDatasetName);
      toast.success("Dataset renamed");
      setEditingDatasetId(null);
    } catch {
      toast.error("Failed to rename dataset");
    }
  };

  const handleDeleteDataset = async (datasetId: string) => {
    try {
      await deleteDataset(datasetId);
      setDatasetRecords(prev => {
        const newRecords = { ...prev };
        delete newRecords[datasetId];
        return newRecords;
      });
      setExpandedDatasets(prev => {
        const newSet = new Set(prev);
        newSet.delete(datasetId);
        return newSet;
      });
      toast.success("Dataset deleted");
    } catch {
      toast.error("Failed to delete dataset");
    }
    setDeleteConfirm(null);
  };

  const handleDeleteRecord = async (datasetId: string, recordId: string) => {
    try {
      await deleteRecord(datasetId, recordId);
      setDatasetRecords(prev => ({
        ...prev,
        [datasetId]: prev[datasetId]?.filter(r => r.id !== recordId) || [],
      }));
      toast.success("Record deleted");
    } catch {
      toast.error("Failed to delete record");
    }
    setDeleteConfirm(null);
  };

  const handleUpdateRecordTopic = async (datasetId: string, recordId: string, topic: string) => {
    try {
      await updateRecordTopic(datasetId, recordId, topic);
      setDatasetRecords(prev => ({
        ...prev,
        [datasetId]: prev[datasetId]?.map(r =>
          r.id === recordId ? { ...r, topic: topic.trim() || undefined } : r
        ) || [],
      }));
      toast.success("Topic updated");
    } catch {
      toast.error("Failed to update topic");
    }
  };

  const handleCreateDataset = async (name: string) => {
    try {
      await createDataset(name);
      toast.success("Dataset created");
    } catch {
      toast.error("Failed to create dataset");
    }
  };

  const handleImportToDataset = async (result: ImportResult) => {
    try {
      let targetDatasetId: string;
      let datasetName: string;

      if (result.target === "new" && result.newDatasetName) {
        // Create new dataset first
        const newDataset = await createDataset(result.newDatasetName);
        targetDatasetId = newDataset.id;
        datasetName = newDataset.name;
      } else if (result.target === "existing" && result.existingDatasetId) {
        // Use existing dataset
        targetDatasetId = result.existingDatasetId;
        const existingDataset = datasets.find(d => d.id === targetDatasetId);
        datasetName = existingDataset?.name || "dataset";

        // If replace mode, clear existing records first
        if (result.mode === "replace") {
          await clearDatasetRecords(targetDatasetId);
          // Clear local cache for this dataset
          setDatasetRecords(prev => ({ ...prev, [targetDatasetId]: [] }));
        }
      } else {
        throw new Error("Invalid import configuration");
      }

      // Import the records
      const count = await importRecords(
        targetDatasetId,
        result.records,
        result.defaultTopic
      );

      // Refresh records cache if the dataset is expanded
      if (expandedDatasets.has(targetDatasetId)) {
        const datasetWithRecords = await getDatasetWithRecords(targetDatasetId);
        if (datasetWithRecords) {
          setDatasetRecords(prev => ({ ...prev, [targetDatasetId]: datasetWithRecords.records }));
        }
      }

      toast.success(
        result.target === "new"
          ? `Created "${datasetName}" with ${count} record${count !== 1 ? "s" : ""}`
          : `Imported ${count} record${count !== 1 ? "s" : ""} to "${datasetName}"`
      );
    } catch (err) {
      console.error("Failed to import data:", err);
      toast.error("Failed to import data");
      throw err;
    }
  };

  return (
    <>
      <div className="flex-1 overflow-auto">
        <div className="w-full max-w-5xl mx-auto px-6 py-6">
          <DatasetsListHeader
            searchQuery={searchQuery}
            datasetCount={datasets.length}
            onSearchChange={setSearchQuery}
            onImportClick={() => setShowImportDialog(true)}
            onCreateDataset={handleCreateDataset}
          />

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-muted-foreground">Loading datasets...</span>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex items-center justify-center py-12">
              <div className="text-red-500">Error: {error.message}</div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && datasets.length === 0 && (
            <DatasetsEmptyState />
          )}

          {/* No results state */}
          {!isLoading && !error && datasets.length > 0 && filteredDatasets.length === 0 && (
            <DatasetsNoResultsState searchQuery={searchQuery} />
          )}

          {/* Dataset list */}
          {!isLoading && !error && filteredDatasets.length > 0 && (
            <div className="space-y-3">
              {filteredDatasets.map((dataset) => {
                const isExpanded = expandedDatasets.has(dataset.id);
                const records = datasetRecords[dataset.id] || [];
                const isLoadingRecords = loadingRecords.has(dataset.id);
                const isEditing = editingDatasetId === dataset.id;

                return (
                  <DatasetItem
                    key={dataset.id}
                    datasetId={dataset.id}
                    name={dataset.name}
                    recordCount={recordCounts[dataset.id] ?? "..."}
                    updatedAt={dataset.updatedAt}
                    records={records}
                    isExpanded={isExpanded}
                    isLoadingRecords={isLoadingRecords}
                    isEditing={isEditing}
                    editingName={editingDatasetName}
                    maxRecords={MAX_VISIBLE_RECORDS}
                    onToggle={() => toggleDataset(dataset.id)}
                    onSelect={() => onSelectDataset(dataset.id)}
                    onEditNameChange={setEditingDatasetName}
                    onSaveRename={() => handleRenameDataset(dataset.id)}
                    onCancelRename={() => setEditingDatasetId(null)}
                    onStartRename={() => {
                      setEditingDatasetId(dataset.id);
                      setEditingDatasetName(dataset.name);
                    }}
                    onDelete={() => setDeleteConfirm({ type: "dataset", id: dataset.id })}
                    onUpdateRecordTopic={(recordId, topic) =>
                      handleUpdateRecordTopic(dataset.id, recordId, topic)
                    }
                    onDeleteRecord={(recordId) =>
                      setDeleteConfirm({ type: "record", id: recordId, datasetId: dataset.id })
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <DeleteConfirmationDialog
        confirmation={deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
        onConfirm={(confirmation) => {
          if (confirmation.type === "dataset") {
            handleDeleteDataset(confirmation.id);
          } else if (confirmation.type === "record" && confirmation.datasetId) {
            handleDeleteRecord(confirmation.datasetId, confirmation.id);
          }
        }}
      />

      {/* Import data dialog */}
      <IngestDataDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        datasets={datasets}
        onImportToDataset={handleImportToDataset}
      />
    </>
  );
}
