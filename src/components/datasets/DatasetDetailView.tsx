/**
 * DatasetDetailView
 *
 * Displays all records for a selected dataset with full functionality.
 */

import { useState, useEffect, useCallback } from "react";
import { useDatasets } from "@/hooks/useDatasets";
import { Dataset, DatasetRecord } from "@/types/dataset-types";
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
import { getDataAsObject, getLabel } from "./record-utils";

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
    renameDataset,
  } = useDatasets();

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [records, setRecords] = useState<DatasetRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmation | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignTopicDialog, setAssignTopicDialog] = useState(false);
  const [bulkTopic, setBulkTopic] = useState("");
  const [expandedRecord, setExpandedRecord] = useState<DatasetRecord | null>(null);
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

  // Update dataset from context when it changes
  useEffect(() => {
    const updated = datasets.find(d => d.id === datasetId);
    if (updated && dataset) {
      setDataset(updated);
    }
  }, [datasets, datasetId, dataset]);

  // Filter records by search query
  const filteredRecords = searchQuery.trim()
    ? records.filter(r => {
        const query = searchQuery.toLowerCase();
        const label = getLabel(r)?.toLowerCase() || "";
        const topic = r.topic?.toLowerCase() || "";
        const data = getDataAsObject(r);
        const spanId = ((data.span_id as string) || r.id).toLowerCase();
        return label.includes(query) || topic.includes(query) || spanId.includes(query);
      })
    : records;

  // Sort records
  const sortedRecords = [...filteredRecords].sort((a, b) => {
    const direction = sortConfig.direction === "asc" ? 1 : -1;

    switch (sortConfig.field) {
      case "timestamp":
        return (a.createdAt - b.createdAt) * direction;
      case "topic":
        const topicA = a.topic?.toLowerCase() || "";
        const topicB = b.topic?.toLowerCase() || "";
        if (!topicA && !topicB) return 0;
        if (!topicA) return 1; // Empty topics go last
        if (!topicB) return -1;
        return topicA.localeCompare(topicB) * direction;
      case "evaluation":
        const scoreA = a.evaluation?.score ?? -1;
        const scoreB = b.evaluation?.score ?? -1;
        if (scoreA === -1 && scoreB === -1) return 0;
        if (scoreA === -1) return 1; // No evaluation goes last
        if (scoreB === -1) return -1;
        return (scoreA - scoreB) * direction;
      default:
        return 0;
    }
  });

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
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(recordId);
        return newSet;
      });
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
          r.id === recordId ? { ...r, topic: topic.trim() || undefined } : r
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

    const selectedRecordIds = Array.from(selectedIds);
    let successCount = 0;

    for (const recordId of selectedRecordIds) {
      try {
        await updateRecordTopic(dataset.id, recordId, bulkTopic.trim());
        successCount++;
      } catch {
        // Continue with other records
      }
    }

    if (successCount > 0) {
      setRecords(prev =>
        prev.map(r =>
          selectedIds.has(r.id) ? { ...r, topic: bulkTopic.trim() } : r
        )
      );
      toast.success(`Assigned topic to ${successCount} record${successCount !== 1 ? "s" : ""}`);
    }

    setAssignTopicDialog(false);
    setBulkTopic("");
    setSelectedIds(new Set());
  };

  const handleBulkRunEvaluation = () => {
    toast.info("Run evaluation feature coming soon");
  };

  const handleBulkDelete = async () => {
    if (!dataset) return;

    const selectedRecordIds = Array.from(selectedIds);
    let successCount = 0;

    for (const recordId of selectedRecordIds) {
      try {
        await deleteRecord(dataset.id, recordId);
        successCount++;
      } catch {
        // Continue with other records
      }
    }

    if (successCount > 0) {
      setRecords(prev => prev.filter(r => !selectedIds.has(r.id)));
      toast.success(`Deleted ${successCount} record${successCount !== 1 ? "s" : ""}`);
    }

    setSelectedIds(new Set());
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
            selectedCount={selectedIds.size}
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
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              sortConfig={sortConfig}
              onSortChange={setSortConfig}
              emptyMessage={searchQuery ? `No records match "${searchQuery}"` : "No records in this dataset"}
              onUpdateTopic={handleUpdateRecordTopic}
              onDelete={(recordId: string) =>
                setDeleteConfirm({ type: "record", id: recordId, datasetId: dataset.id })
              }
              onExpand={setExpandedRecord}
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
              Assign a topic to {selectedIds.size} selected record{selectedIds.size !== 1 ? "s" : ""}.
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
      <Dialog open={!!expandedRecord} onOpenChange={(open) => !open && setExpandedRecord(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Trace Data</DialogTitle>
            <DialogDescription>
              {expandedRecord?.topic && (
                <span className="text-[rgb(var(--theme-500))]">Topic: {expandedRecord.topic}</span>
              )}
              {expandedRecord?.topic && " • "}
              Added {expandedRecord && new Date(expandedRecord.createdAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <pre className="text-xs font-mono bg-muted/50 p-4 rounded-lg whitespace-pre-wrap break-all">
              {expandedRecord && JSON.stringify(expandedRecord.data, null, 2)}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpandedRecord(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
