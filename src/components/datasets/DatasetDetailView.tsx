/**
 * DatasetDetailView
 *
 * Displays all records for a selected dataset with full functionality.
 */

import { useState, useEffect, useCallback } from "react";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import { DatasetsUIConsumer } from "@/contexts/DatasetsUIContext";
import { Dataset, DatasetRecord } from "@/types/dataset-types";
import { emitter } from "@/utils/eventEmitter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DeleteConfirmationDialog,
  type DeleteConfirmation,
} from "./DeleteConfirmationDialog";
import { DatasetDetailHeader } from "./DatasetDetailHeader";
import { RecordsToolbar, SortConfig } from "./RecordsToolbar";
import { RecordsTable } from "./RecordsTable";
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";
import { filterAndSortRecords } from "./record-filters";

interface DatasetDetailViewProps {
  datasetId: string;
  onBack: () => void;
}

export function DatasetDetailView({ datasetId, onBack }: DatasetDetailViewProps) {
  const {
    datasets,
    getDatasetWithRecords,
    deleteDataset,
    deleteRecord,
    updateRecordTopic,
    updateRecordData,
    renameDataset,
  } = DatasetsConsumer();

  // Get selection state from UI context (shared with Lucy tools)
  const { selectedRecordIds, setSelectedRecordIds } = DatasetsUIConsumer();

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [records, setRecords] = useState<DatasetRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmation | null>(null);
  const [assignTopicDialog, setAssignTopicDialog] = useState(false);
  const [bulkTopic, setBulkTopic] = useState("");
  const [expandedRecord, setExpandedRecord] = useState<DatasetRecord | null>(null);
  const [editedJson, setEditedJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSavingData, setIsSavingData] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: "timestamp",
    direction: "desc",
  });

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

  useEffect(() => {
    loadDataset();
  }, [loadDataset]);

  // Listen for dataset refresh events from agent tools
  useEffect(() => {
    const handleRefresh = () => {
      loadDataset();
    };
    emitter.on('vllora_dataset_refresh' as any, handleRefresh);
    return () => {
      emitter.off('vllora_dataset_refresh' as any, handleRefresh);
    };
  }, [loadDataset]);

  // Listen for records deleted events from agent tools (same logic as handleBulkDelete)
  useEffect(() => {
    const handleRecordsDeleted = (data: { datasetId: string; recordIds: string[] }) => {
      // Only handle if it's for the current dataset
      if (data.datasetId !== datasetId) return;

      const deletedSet = new Set(data.recordIds);
      // Update local records state
      setRecords(prev => prev.filter(r => !deletedSet.has(r.id)));
      // Clear selection for deleted records
      const newSelection = new Set(selectedRecordIds);
      data.recordIds.forEach(id => newSelection.delete(id));
      setSelectedRecordIds(newSelection);
      toast.success(`Deleted ${data.recordIds.length} record${data.recordIds.length !== 1 ? "s" : ""}`);
    };
    emitter.on('vllora_dataset_records_deleted' as any, handleRecordsDeleted);
    return () => {
      emitter.off('vllora_dataset_records_deleted' as any, handleRecordsDeleted);
    };
  }, [datasetId, selectedRecordIds, setSelectedRecordIds]);

  // Update dataset from context when it changes
  useEffect(() => {
    const updated = datasets.find(d => d.id === datasetId);
    if (updated && dataset) {
      setDataset(updated);
    }
  }, [datasets, datasetId, dataset]);

  // Filter and sort records using shared utility (same logic as Lucy tools)
  const sortedRecords = filterAndSortRecords(
    records,
    { search: searchQuery },
    { field: sortConfig.field, direction: sortConfig.direction }
  );

  // Handlers
  const handleRenameDataset = async (newName: string) => {
    if (!dataset) return;
    try {
      await renameDataset(dataset.id, newName);
      setDataset({ ...dataset, name: newName });
      toast.success("Dataset renamed");
    } catch {
      toast.error("Failed to rename dataset");
    }
  };

  const handleDeleteDataset = async () => {
    if (!dataset) return;
    try {
      await deleteDataset(dataset.id);
      toast.success("Dataset deleted");
      onBack();
    } catch {
      toast.error("Failed to delete dataset");
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!dataset) return;
    try {
      await deleteRecord(dataset.id, recordId);
      setRecords(prev => prev.filter(r => r.id !== recordId));
      // Remove deleted record from selection
      const newSelection = new Set(selectedRecordIds);
      newSelection.delete(recordId);
      setSelectedRecordIds(newSelection);
      toast.success("Record deleted");
    } catch {
      toast.error("Failed to delete record");
    }
  };

  const handleUpdateRecordTopic = async (recordId: string, topic: string) => {
    if (!dataset) return;
    try {
      await updateRecordTopic(dataset.id, recordId, topic);
      setRecords(prev =>
        prev.map(r =>
          r.id === recordId ? { ...r, topic: topic.trim() || undefined, updatedAt: Date.now() } : r
        )
      );
      toast.success("Topic updated");
    } catch {
      toast.error("Failed to update topic");
    }
  };

  const handleDeleteConfirm = (confirmation: DeleteConfirmation) => {
    if (confirmation.type === "dataset") {
      handleDeleteDataset();
    } else if (confirmation.type === "record") {
      handleDeleteRecord(confirmation.id);
    }
    setDeleteConfirm(null);
  };

  // Bulk actions
  const handleBulkAssignTopic = async () => {
    if (!dataset || !bulkTopic.trim()) return;

    const idsToProcess = Array.from(selectedRecordIds);
    let successCount = 0;

    for (const recordId of idsToProcess) {
      try {
        await updateRecordTopic(dataset.id, recordId, bulkTopic.trim());
        successCount++;
      } catch {
        // Continue with other records
      }
    }

    if (successCount > 0) {
      const now = Date.now();
      setRecords(prev =>
        prev.map(r =>
          selectedRecordIds.has(r.id) ? { ...r, topic: bulkTopic.trim(), updatedAt: now } : r
        )
      );
      toast.success(`Assigned topic to ${successCount} record${successCount !== 1 ? "s" : ""}`);
    }

    setAssignTopicDialog(false);
    setBulkTopic("");
    setSelectedRecordIds(new Set());
  };

  const handleBulkRunEvaluation = () => {
    toast.info("Run evaluation feature coming soon");
  };

  const handleBulkDelete = async () => {
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
      setRecords(prev => prev.filter(r => !selectedRecordIds.has(r.id)));
      toast.success(`Deleted ${successCount} record${successCount !== 1 ? "s" : ""}`);
    }

    setSelectedRecordIds(new Set());
  };

  const handleExport = () => {
    if (!dataset) return;
    // Export dataset as JSON
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
  };

  // Handle opening expand dialog
  const handleExpandRecord = (record: DatasetRecord) => {
    setExpandedRecord(record);
    setEditedJson(JSON.stringify(record.data, null, 2));
    setJsonError(null);
  };

  // Handle closing expand dialog
  const handleCloseExpand = () => {
    setExpandedRecord(null);
    setEditedJson("");
    setJsonError(null);
  };

  // Handle JSON change in editor
  const handleJsonChange = (value: string) => {
    setEditedJson(value);
    try {
      if (value.trim()) {
        JSON.parse(value);
        setJsonError(null);
      }
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  // Handle saving updated record data
  const handleSaveRecordData = async () => {
    if (!dataset || !expandedRecord || jsonError) return;

    try {
      const parsedData = JSON.parse(editedJson);
      setIsSavingData(true);
      await updateRecordData(dataset.id, expandedRecord.id, parsedData);

      // Update local records state
      setRecords(prev =>
        prev.map(r =>
          r.id === expandedRecord.id ? { ...r, data: parsedData, updatedAt: Date.now() } : r
        )
      );

      toast.success("Record data updated");
      handleCloseExpand();
    } catch (err) {
      toast.error("Failed to save record data");
    } finally {
      setIsSavingData(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-muted-foreground">Loading dataset...</span>
        </div>
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Dataset not found</p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Datasets
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-auto">
        <div className="w-full max-w-6xl mx-auto px-6 py-6">
          {/* Header */}
          <DatasetDetailHeader
            name={dataset.name}
            recordCount={records.length}
            createdAt={dataset.createdAt}
            updatedAt={dataset.updatedAt}
            onBack={onBack}
            onRename={handleRenameDataset}
            onExport={handleExport}
          />

          {/* Toolbar */}
          <RecordsToolbar
            selectedCount={selectedRecordIds.size}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortConfig={sortConfig}
            onSortChange={setSortConfig}
            onAssignTopic={() => setAssignTopicDialog(true)}
            onRunEvaluation={handleBulkRunEvaluation}
            onDeleteSelected={handleBulkDelete}
          />

          {/* Records table */}
          <div className="border border-border rounded-lg overflow-hidden bg-card">
            <RecordsTable
              records={sortedRecords}
              showHeader
              showFooter
              selectable
              selectedIds={selectedRecordIds}
              onSelectionChange={setSelectedRecordIds}
              sortConfig={sortConfig}
              onSortChange={setSortConfig}
              emptyMessage={searchQuery ? `No records match "${searchQuery}"` : "No records in this dataset"}
              onUpdateTopic={handleUpdateRecordTopic}
              onDelete={(recordId: string) =>
                setDeleteConfirm({ type: "record", id: recordId, datasetId: dataset.id })
              }
              onExpand={handleExpandRecord}
              height={500}
            />
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <DeleteConfirmationDialog
        confirmation={deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
        onConfirm={handleDeleteConfirm}
      />

      {/* Assign topic dialog */}
      <Dialog open={assignTopicDialog} onOpenChange={setAssignTopicDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Topic</DialogTitle>
            <DialogDescription>
              Assign a topic to {selectedRecordIds.size} selected record{selectedRecordIds.size !== 1 ? "s" : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={bulkTopic}
              onChange={(e) => setBulkTopic(e.target.value)}
              placeholder="Enter topic name..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && bulkTopic.trim()) {
                  handleBulkAssignTopic();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTopicDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkAssignTopic}
              disabled={!bulkTopic.trim()}
              className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            >
              Assign Topic
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expand trace dialog */}
      <Dialog open={!!expandedRecord} onOpenChange={(open) => !open && handleCloseExpand()}>
        <DialogContent className="max-w-4xl h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Trace Data</DialogTitle>
            <DialogDescription>
              {expandedRecord?.topic && (
                <span className="text-[rgb(var(--theme-500))]">Topic: {expandedRecord.topic}</span>
              )}
              {expandedRecord?.topic && " • "}
              Added {expandedRecord && new Date(expandedRecord.createdAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {expandedRecord && (
              <JsonEditor
                value={editedJson}
                onChange={handleJsonChange}
                hideValidation={!jsonError}
              />
            )}
          </div>
          {jsonError && (
            <div className="text-xs text-red-500 px-1">
              Invalid JSON: {jsonError}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCloseExpand}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveRecordData}
              disabled={!!jsonError || isSavingData}
              className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            >
              {isSavingData ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
