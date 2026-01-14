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
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DeleteConfirmationDialog,
  type DeleteConfirmation,
} from "./DeleteConfirmationDialog";
import { AssignTopicDialog } from "./AssignTopicDialog";
import { ExpandTraceDialog } from "./ExpandTraceDialog";
import { IngestDataDialog, type ImportMode } from "./IngestDataDialog";
import { DatasetDetailHeader } from "./DatasetDetailHeader";
import { startFinetuneJob } from "@/services/finetune-api";
import { RecordsToolbar, SortConfig } from "./RecordsToolbar";
import { RecordsTable } from "./RecordsTable";
import { filterAndSortRecords } from "./record-filters";
import { generateTopics } from "@/lib/distri-dataset-tools/analysis/generate-topics";
import { generateTraces } from "@/lib/distri-dataset-tools/analysis/generate-traces";

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
    updateRecordEvaluation,
    renameDataset,
    importRecords,
    clearDatasetRecords,
  } = DatasetsConsumer();

  // Get selection state from UI context (shared with Lucy tools)
  const { selectedRecordIds, setSelectedRecordIds } = DatasetsUIConsumer();

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [records, setRecords] = useState<DatasetRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmation | null>(null);
  const [assignTopicDialog, setAssignTopicDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [expandedRecord, setExpandedRecord] = useState<DatasetRecord | null>(null);
  const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
  const [isGeneratingTraces, setIsGeneratingTraces] = useState(false);
  const [isStartingFinetune, setIsStartingFinetune] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: "timestamp",
    direction: "desc",
  });
  const [groupByTopic, setGroupByTopic] = useState(false);
  const [generatedFilter, setGeneratedFilter] = useState<"all" | "generated" | "not_generated">("all");

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
    { search: searchQuery, generated: generatedFilter },
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
      const now = Date.now();
      setRecords(prev =>
        prev.map(r =>
          r.id === recordId ? { ...r, topic: topic.trim() || undefined, updatedAt: now } : r
        )
      );
      // Also update expanded record if viewing it
      if (expandedRecord?.id === recordId) {
        setExpandedRecord(prev => prev ? { ...prev, topic: topic.trim() || undefined, updatedAt: now } : null);
      }
      toast.success("Topic updated");
    } catch {
      toast.error("Failed to update topic");
    }
  };

  const handleUpdateRecordEvaluation = async (recordId: string, score: number | undefined) => {
    if (!dataset) return;
    try {
      await updateRecordEvaluation(dataset.id, recordId, score);
      const now = Date.now();
      const newEvaluation = score === undefined ? undefined : { score, evaluatedAt: now };
      setRecords(prev =>
        prev.map(r =>
          r.id === recordId ? { ...r, evaluation: newEvaluation, updatedAt: now } : r
        )
      );
      // Also update expanded record if viewing it
      if (expandedRecord?.id === recordId) {
        setExpandedRecord(prev => prev ? { ...prev, evaluation: newEvaluation, updatedAt: now } : null);
      }
      toast.success(score === undefined ? "Evaluation cleared" : `Rated ${score}/5`);
    } catch {
      toast.error("Failed to update evaluation");
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
  const handleBulkAssignTopic = async (topic: string) => {
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
      setRecords(prev =>
        prev.map(r =>
          selectedRecordIds.has(r.id) ? { ...r, topic, updatedAt: now } : r
        )
      );
      toast.success(`Assigned topic to ${successCount} record${successCount !== 1 ? "s" : ""}`);
    }

    setAssignTopicDialog(false);
    setSelectedRecordIds(new Set());
  };

  const handleGenerateTopics = async () => {
    if (!dataset) return;
    const recordIds = Array.from(selectedRecordIds);
    if (recordIds.length === 0) return;

    const maxDepth = 3;
    const degree = 2;

    setIsGeneratingTopics(true);
    try {
      const result = await generateTopics({
        datasetId: dataset.id,
        recordIds,
        maxTopics: 3,
        maxDepth,
        degree,
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
  };

  const handleGenerateTraces = async () => {
    if (!dataset) return;

    const recordIds = Array.from(selectedRecordIds);

    setIsGeneratingTraces(true);
    try {
      const result = await generateTraces({
        datasetId: dataset.id,
        recordIds: recordIds.length > 0 ? recordIds : undefined,
        count: 2,
        maxTurns: 3,
      });

      if (result.success) {
        toast.success(`Generated ${result.created_count ?? 0} synthetic trace${(result.created_count ?? 0) === 1 ? "" : "s"}`);
        await loadDataset();
      } else {
        toast.error(result.error || "Failed to generate traces");
      }
    } catch (err) {
      console.error("Failed to generate traces", err);
      toast.error("Failed to generate traces");
    } finally {
      setIsGeneratingTraces(false);
    }
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

  const handleStartFinetune = async () => {
    if (!dataset || records.length === 0 || isStartingFinetune) return;

    setIsStartingFinetune(true);
    try {
      const job = await startFinetuneJob({ ...dataset, records });
      toast.success("Fine-tuning job started", {
        description: `Job ID: ${job.id}`,
      });
    } catch (err) {
      console.error("Failed to start fine-tuning job:", err);
      toast.error("Failed to start fine-tuning job", {
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setIsStartingFinetune(false);
    }
  };

  // Handle importing records from file
  const handleImportRecords = async (
    importedRecords: Array<{ data: unknown; topic?: string }>,
    mode: ImportMode,
    defaultTopic?: string
  ) => {
    if (!dataset) return;

    // If replace mode, clear existing records first
    if (mode === "replace" && records.length > 0) {
      await clearDatasetRecords(dataset.id);
      // Clear selection since all records are deleted
      setSelectedRecordIds(new Set());
    }

    const count = await importRecords(dataset.id, importedRecords, defaultTopic);
    // Reload to get the new records
    await loadDataset();

    if (mode === "replace") {
      toast.success(`Replaced dataset with ${count} record${count !== 1 ? "s" : ""}`);
    } else {
      toast.success(`Imported ${count} record${count !== 1 ? "s" : ""}`);
    }
  };

  // Handle saving updated record data from dialog
  const handleSaveRecordData = async (recordId: string, data: unknown) => {
    if (!dataset) return;

    await updateRecordData(dataset.id, recordId, data);

    // Update local records state
    setRecords(prev =>
      prev.map(r =>
        r.id === recordId ? { ...r, data, updatedAt: Date.now() } : r
      )
    );

    toast.success("Record data updated");
    setExpandedRecord(null);
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
            onIngest={() => setImportDialog(true)}
            onFinetune={handleStartFinetune}
            isFinetuning={isStartingFinetune}
          />

          {/* Toolbar */}
          <RecordsToolbar
            selectedCount={selectedRecordIds.size}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortConfig={sortConfig}
            onSortChange={setSortConfig}
            groupByTopic={groupByTopic}
            onGroupByTopicChange={setGroupByTopic}
            onAssignTopic={() => setAssignTopicDialog(true)}
            generatedFilter={generatedFilter}
            onGeneratedFilterChange={setGeneratedFilter}
            onGenerateTopics={handleGenerateTopics}
            isGeneratingTopics={isGeneratingTopics}
            onGenerateTraces={handleGenerateTraces}
            isGeneratingTraces={isGeneratingTraces}
            onRunEvaluation={handleBulkRunEvaluation}
            onDeleteSelected={handleBulkDelete}
          />

          {/* Records table */}
          <div className="border border-border rounded-lg overflow-hidden bg-card">
            <RecordsTable
              records={sortedRecords}
              datasetId={datasetId}
              showHeader
              showFooter
              selectable
              selectedIds={selectedRecordIds}
              onSelectionChange={setSelectedRecordIds}
              sortConfig={sortConfig}
              onSortChange={setSortConfig}
              groupByTopic={groupByTopic}
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
      <AssignTopicDialog
        open={assignTopicDialog}
        onOpenChange={setAssignTopicDialog}
        selectedCount={selectedRecordIds.size}
        onAssign={handleBulkAssignTopic}
      />

      {/* Expand trace dialog */}
      <ExpandTraceDialog
        record={expandedRecord}
        onOpenChange={(open) => !open && setExpandedRecord(null)}
        onSave={handleSaveRecordData}
        onUpdateTopic={handleUpdateRecordTopic}
        onUpdateEvaluation={handleUpdateRecordEvaluation}
      />

      {/* Import data dialog */}
      <IngestDataDialog
        open={importDialog}
        onOpenChange={setImportDialog}
        datasetId={dataset.id}
        onImport={handleImportRecords}
        currentRecordCount={records.length}
      />
    </>
  );
}
