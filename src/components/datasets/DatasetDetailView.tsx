/**
 * DatasetDetailView
 *
 * Displays all records for a selected dataset with full functionality.
 * Uses DatasetDetailContext to manage state and reduce prop drilling.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  DatasetDetailProvider,
  DatasetDetailConsumer,
} from "@/contexts/DatasetDetailContext";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";
import { AssignTopicDialog } from "./AssignTopicDialog";
import { ExpandTraceDialog } from "./ExpandTraceDialog";
import { IngestDataDialog } from "./IngestDataDialog";
import { DatasetDetailHeader } from "./DatasetDetailHeader";
import { RecordsToolbar } from "./RecordsToolbar";
import { RecordsTable } from "./RecordsTable";

interface DatasetDetailViewProps {
  datasetId: string;
  onBack: () => void;
  /** Called when user selects a different dataset from the dropdown */
  onSelectDataset?: (datasetId: string) => void;
}

export function DatasetDetailView({ datasetId, onBack, onSelectDataset }: DatasetDetailViewProps) {
  return (
    <DatasetDetailProvider
      datasetId={datasetId}
      onBack={onBack}
      onSelectDataset={onSelectDataset}
    >
      <DatasetDetailContent />
    </DatasetDetailProvider>
  );
}

/** Inner component that consumes the context */
function DatasetDetailContent() {
  const {
    // Core data
    dataset,
    sortedRecords,
    isLoading,
    datasetId,

    // Navigation
    onBack,

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

    // Loading states
    isGeneratingTopics,
    isGeneratingTraces,

    // Handlers
    handleUpdateRecordTopic,
    handleUpdateRecordEvaluation,
    handleDeleteConfirm,
    handleBulkAssignTopic,
    handleGenerateTopics,
    handleGenerateTraces,
    handleBulkRunEvaluation,
    handleBulkDelete,
    handleImportRecords,
    handleSaveRecordData,
    handleCreateDataset,
  } = DatasetDetailConsumer();

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
          {/* Header - consumes context directly */}
          <DatasetDetailHeader />

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
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
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
              columnVisibility={columnVisibility}
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
        currentRecordCount={sortedRecords.length}
      />

      {/* Create dataset dialog */}
      <Dialog open={createDatasetDialog} onOpenChange={(open) => {
        setCreateDatasetDialog(open);
        if (!open) setNewDatasetName("");
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create new dataset</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              value={newDatasetName}
              onChange={(e) => setNewDatasetName(e.target.value)}
              placeholder="Dataset name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newDatasetName.trim()) {
                  handleCreateDataset();
                }
                if (e.key === "Escape") {
                  setCreateDatasetDialog(false);
                  setNewDatasetName("");
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setCreateDatasetDialog(false);
                  setNewDatasetName("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDataset}
                disabled={!newDatasetName.trim()}
                className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
              >
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
